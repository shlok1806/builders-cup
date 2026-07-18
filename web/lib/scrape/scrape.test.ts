import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getForQuery, normalizeQuery } from './fixtures'
import { serpapi } from './adapters/serpapi'

// Swap the service-role client for an in-memory fake so the orchestrator can be
// exercised without a database. `h.db` is reset per test.
const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../supabase', () => ({ admin: () => h.db }))

// Imported after the mock is registered so getOffers picks up the fake admin().
import { getOffers } from './index'

describe('normalizeQuery', () => {
  it('trims, lowercases, and collapses internal whitespace', () => {
    expect(normalizeQuery('  Paper   Towels ')).toBe('paper towels')
  })
})

describe('getForQuery', () => {
  it('returns the cached multi-vendor offers for a known prompt', () => {
    const offers = getForQuery('paper towels')
    expect(offers).toHaveLength(3)
    expect(new Set(offers.map((o) => o.vendor))).toEqual(new Set(['Walmart', 'Target', 'Amazon']))
  })

  it('returns [] for an unknown prompt', () => {
    expect(getForQuery('caviar')).toEqual([])
  })
})

describe('serpapi adapter', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
    delete process.env.SERPAPI_KEY
    vi.restoreAllMocks()
  })

  it('returns [] without an API key and never touches the network', async () => {
    delete process.env.SERPAPI_KEY
    const spy = vi.fn()
    globalThis.fetch = spy as unknown as typeof fetch
    expect(await serpapi.fetchOffers('coffee')).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('maps shopping results to RawOffers, converting dollars to integer cents', async () => {
    process.env.SERPAPI_KEY = 'test-key'
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        shopping_results: [
          { title: 'Bounty 12ct', source: 'Walmart', product_link: 'https://w/x', extracted_price: 22.99 },
          { title: 'no price', source: 'Target' }, // dropped: no extracted_price
          { title: 'no source', extracted_price: 9.99 }, // dropped: no source
        ],
      }),
    })) as unknown as typeof fetch

    const offers = await serpapi.fetchOffers('paper towels')
    expect(offers).toHaveLength(1)
    expect(offers[0]).toMatchObject({
      vendor: 'Walmart',
      title: 'Bounty 12ct',
      url: 'https://w/x',
      priceCents: 2299,
      inStock: true,
    })
  })

  it('returns [] on a non-ok response', async () => {
    process.env.SERPAPI_KEY = 'test-key'
    globalThis.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch
    expect(await serpapi.fetchOffers('coffee')).toEqual([])
  })

  it('returns [] when the request throws', async () => {
    process.env.SERPAPI_KEY = 'test-key'
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    expect(await serpapi.fetchOffers('coffee')).toEqual([])
  })
})

// Stateful in-memory stand-in for the Supabase query builder that getOffers()
// drives: canonical product upsert, per-vendor offer refresh, scrape_runs insert.
function makeDb() {
  const state = {
    products: new Map<string, { id: string }>(),
    offers: [] as Record<string, unknown>[],
    runs: [] as Record<string, unknown>[],
  }
  let pid = 0
  let oid = 0
  const from = (table: string) => {
    let lookupKey: string | null = null
    let pendingInsert: Record<string, unknown> | null = null
    const b: Record<string, unknown> = {
      select: () => b,
      delete: () => b,
      eq: (col: string, val: string) => {
        if (col === 'canonical_key') lookupKey = val
        return b
      },
      insert: (row: Record<string, unknown>) => {
        pendingInsert = row
        return b
      },
      maybeSingle: async () => ({ data: state.products.get(lookupKey!) ?? null }),
      single: async () => {
        if (table === 'products' && pendingInsert) {
          const id = `p${++pid}`
          state.products.set(pendingInsert.canonical_key as string, { id })
          return { data: { id }, error: null }
        }
        if (table === 'offers' && pendingInsert) {
          const row = { id: `o${++oid}`, ...pendingInsert }
          state.offers.push(row)
          return { data: row, error: null }
        }
        return { data: null, error: null }
      },
      // delete-chains and scrape_runs inserts are awaited directly.
      then: (resolve: (v: { data: null; error: null }) => void) => {
        if (table === 'scrape_runs' && pendingInsert) state.runs.push(pendingInsert)
        resolve({ data: null, error: null })
      },
    }
    return b
  }
  return { db: { from } as unknown, state }
}

describe('getOffers orchestrator', () => {
  beforeEach(() => {
    delete process.env.SERPAPI_KEY // force the fixture fallback
  })
  afterEach(() => vi.restoreAllMocks())

  it('falls back to cached fixtures, writes one offer per vendor, and records an ok run', async () => {
    const { db, state } = makeDb()
    h.db = db

    const inserted = await getOffers('paper towels')

    expect(inserted).toHaveLength(3) // Walmart, Target, Amazon
    expect(state.products.size).toBe(1) // all three collapse to one canonical product
    expect(state.runs).toHaveLength(1)
    expect(state.runs[0]).toMatchObject({ adapter: 'fixtures', status: 'ok', offer_count: 3 })
  })

  it('records an ok run with zero offers for an unknown query', async () => {
    const { db, state } = makeDb()
    h.db = db

    const inserted = await getOffers('caviar')

    expect(inserted).toEqual([])
    expect(state.runs).toHaveLength(1)
    expect(state.runs[0]).toMatchObject({ status: 'ok', offer_count: 0 })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getForQuery, normalizeQuery, synthesizeOffers } from './fixtures'
import { isVendorAllowed } from './allowlist'
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

describe('synthesizeOffers', () => {
  it('is deterministic — same query yields the same offers', () => {
    expect(synthesizeOffers('caviar')).toEqual(synthesizeOffers('caviar'))
  })

  it('yields 3 in-stock vendors at strictly ascending, distinct prices', () => {
    const offers = synthesizeOffers('artisanal caviar')
    expect(offers).toHaveLength(3)
    expect(offers.every((o) => o.inStock)).toBe(true)
    expect(new Set(offers.map((o) => o.vendor)).size).toBe(3)
    const prices = offers.map((o) => o.priceCents)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
    expect(new Set(prices).size).toBe(3)
    expect(offers[0].raw).toMatchObject({ synthetic: true })
  })
})

describe('isVendorAllowed', () => {
  it('accepts default reputable retailers, including messy SerpAPI source strings', () => {
    expect(isVendorAllowed('Walmart')).toBe(true)
    expect(isVendorAllowed('Walmart - Seller')).toBe(true) // "- Seller" suffix
    expect(isVendorAllowed('Amazon.com')).toBe(true) // ".com" suffix
    expect(isVendorAllowed("Sam's Club")).toBe(true)
  })

  it('rejects unknown / unvetted vendors and empty sources', () => {
    expect(isVendorAllowed('SketchyDropship LLC')).toBe(false)
    expect(isVendorAllowed('')).toBe(false)
    expect(isVendorAllowed('   ')).toBe(false)
  })

  it('honors a household override list', () => {
    const only = ['Target']
    expect(isVendorAllowed('Target', only)).toBe(true)
    expect(isVendorAllowed('Walmart', only)).toBe(false) // trusted by default, off here
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
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch
    expect(await serpapi.fetchOffers('coffee')).toEqual([])
  })

  it('retries once on a 429 then maps the successful response', async () => {
    process.env.SERPAPI_KEY = 'test-key'
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited', json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ shopping_results: [{ title: 'Bags', source: 'Walmart', extracted_price: 8.58 }] }),
      })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const offers = await serpapi.fetchOffers('trash bags')
    expect(fetchSpy).toHaveBeenCalledTimes(2) // original + one retry
    expect(offers).toHaveLength(1)
    expect(offers[0]).toMatchObject({ vendor: 'Walmart', priceCents: 858 })
  })

  it('does not retry a 401 (bad key never recovers)', async () => {
    process.env.SERPAPI_KEY = 'test-key'
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 401, text: async () => 'bad key', json: async () => ({}) }))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    expect(await serpapi.fetchOffers('coffee')).toEqual([])
    expect(fetchSpy).toHaveBeenCalledTimes(1) // no retry — fail fast to fallback
  })

  it('does not retry a client timeout (may already be charged)', async () => {
    process.env.SERPAPI_KEY = 'test-key'
    const fetchSpy = vi.fn(async () => {
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    expect(await serpapi.fetchOffers('coffee')).toEqual([])
    expect(fetchSpy).toHaveBeenCalledTimes(1) // timeout is terminal, no re-call
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

  it('synthesizes offers for an unknown query so the cart is never empty', async () => {
    const { db, state } = makeDb()
    h.db = db

    const inserted = await getOffers('caviar')

    expect(inserted).toHaveLength(3) // deterministic synthetic vendors
    expect(state.products.size).toBe(1) // all collapse to one canonical product
    expect(state.runs).toHaveLength(1)
    expect(state.runs[0]).toMatchObject({ adapter: 'synthetic', status: 'ok', offer_count: 3 })
  })
})

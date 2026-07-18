import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { canonicalize, canonicalKey } from './dedupe'
import type { RawOffer } from './scrape/types'

describe('canonicalKey', () => {
  it('is order-independent across token permutations', () => {
    expect(canonicalKey('Bounty Paper Towels')).toBe(canonicalKey('Paper Towels Bounty'))
  })

  it('is case-insensitive', () => {
    expect(canonicalKey('DAWN Ultra Dish Soap')).toBe(canonicalKey('dawn ultra dish soap'))
  })

  it('drops stopwords so "ct" and "count" collapse together', () => {
    expect(canonicalKey('Paper Towels 12 ct')).toBe(canonicalKey('Paper Towels 12 count'))
  })

  it('keeps numbers so different sizes stay distinct', () => {
    expect(canonicalKey('Starbucks Coffee 12 oz')).not.toBe(canonicalKey('Starbucks Coffee 28 oz'))
  })

  it('folds the unit into the key', () => {
    expect(canonicalKey('Paper Towels', '12 ct')).toBe(canonicalKey('Paper Towels 12'))
  })

  it('dedupes repeated tokens', () => {
    expect(canonicalKey('Dawn Soap Soap')).toBe('dawn soap')
  })

  it('ignores punctuation between tokens', () => {
    expect(canonicalKey('Bounty, Select-A-Size! Paper Towels')).toBe(
      canonicalKey('Bounty Select A Size Paper Towels'),
    )
  })
})

// A minimal stand-in for the Supabase client that canonicalize() drives:
//   .from('products').select('id').eq('canonical_key', key).maybeSingle()
//   .from('products').insert(row).select('id').single()
// It records inserts and returns a preset `existing` row for the lookup.
function fakeDb(existing: { id: string } | null) {
  const inserts: Record<string, unknown>[] = []
  const chain: Record<string, unknown> = {}
  Object.assign(chain, {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    insert: (row: Record<string, unknown>) => {
      inserts.push(row)
      return chain
    },
    maybeSingle: async () => ({ data: existing }),
    single: async () => ({ data: { id: 'created-id' }, error: null }),
  })
  return { db: chain as unknown as SupabaseClient, inserts }
}

const rawOffer = (over: Partial<RawOffer> = {}): RawOffer => ({
  vendor: 'Walmart',
  title: 'Bounty Paper Towels 12 ct',
  url: null,
  priceCents: 2299,
  unit: '12 ct',
  inStock: true,
  ...over,
})

describe('canonicalize', () => {
  it('returns the existing product id and never inserts on a match', async () => {
    const { db, inserts } = fakeDb({ id: 'existing-id' })
    const id = await canonicalize(db, rawOffer())
    expect(id).toBe('existing-id')
    expect(inserts).toHaveLength(0)
  })

  it('creates a new product when the canonical key is unseen', async () => {
    const { db, inserts } = fakeDb(null)
    const id = await canonicalize(db, rawOffer(), { category: 'household' })
    expect(id).toBe('created-id')
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({
      name: 'Bounty Paper Towels 12 ct',
      category: 'household',
      canonical_key: canonicalKey('Bounty Paper Towels 12 ct', '12 ct'),
      price_cents: 2299,
      unit: '12 ct',
    })
  })

  it('defaults an absent category to "uncategorized"', async () => {
    const { db, inserts } = fakeDb(null)
    await canonicalize(db, rawOffer())
    expect(inserts[0]).toMatchObject({ category: 'uncategorized' })
  })
})

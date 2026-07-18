import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { confidenceScore, deriveItemSignals, median, signalFromHistory } from './learn'

const DAY = 24 * 60 * 60 * 1000

describe('median', () => {
  it('returns the middle of an odd-length set', () => {
    expect(median([3, 1, 2])).toBe(2)
  })
  it('averages the two middles of an even-length set', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
  it('is 0 for an empty set', () => {
    expect(median([])).toBe(0)
  })
})

describe('confidenceScore', () => {
  it('is 0 with no purchases', () => {
    expect(confidenceScore(0, [])).toBe(0)
  })

  it('rises with purchase count and saturates at 3 buys', () => {
    const one = confidenceScore(1, [])
    const three = confidenceScore(3, [])
    const ten = confidenceScore(10, [])
    expect(three).toBeGreaterThan(one)
    expect(ten).toBe(three) // count saturates
  })

  it('rewards a regular cadence over an erratic one', () => {
    const steady = confidenceScore(4, [7, 7, 7]) // perfectly regular
    const erratic = confidenceScore(4, [1, 30, 3]) // same count, high variance
    expect(steady).toBeGreaterThan(erratic)
  })

  it('a perfectly regular, frequently bought item approaches full confidence', () => {
    expect(confidenceScore(5, [7, 7, 7, 7])).toBe(1)
  })

  it('stays within 0..1', () => {
    for (const c of [confidenceScore(1, []), confidenceScore(2, [50, 1]), confidenceScore(9, [7, 7])]) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })
})

describe('signalFromHistory', () => {
  it('derives count, median qty, and mean cadence from the timeline', () => {
    const t0 = Date.UTC(2026, 0, 1)
    const sig = signalFromHistory([t0, t0 + 7 * DAY, t0 + 14 * DAY], [1, 2, 1])
    expect(sig.purchaseCount).toBe(3)
    expect(sig.typicalQty).toBe(1) // median of [1,2,1]
    expect(sig.cadenceDays).toBe(7)
    expect(sig.confidence).toBeGreaterThan(0.9) // 3 buys, dead-regular
  })

  it('has a null cadence and low confidence after a single buy', () => {
    const sig = signalFromHistory([Date.UTC(2026, 0, 1)], [2])
    expect(sig.purchaseCount).toBe(1)
    expect(sig.cadenceDays).toBeNull()
    expect(sig.typicalQty).toBe(2)
    expect(sig.confidence).toBeLessThan(0.5)
  })

  it('clamps typicalQty to at least 1', () => {
    expect(signalFromHistory([1, 2], [0, 0]).typicalQty).toBe(1)
  })

  it('is order-independent (unsorted timestamps)', () => {
    const t0 = Date.UTC(2026, 0, 1)
    const a = signalFromHistory([t0 + 14 * DAY, t0, t0 + 7 * DAY], [1, 1, 1])
    const b = signalFromHistory([t0, t0 + 7 * DAY, t0 + 14 * DAY], [1, 1, 1])
    expect(a).toEqual(b)
  })
})

// A minimal Supabase stand-in for deriveItemSignals' single query:
//   .from('purchase_items').select(...).eq(...).eq(...)  ->  { data: rows }
function fakeDb(rows: unknown[]) {
  const chain: Record<string, unknown> = {}
  Object.assign(chain, {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    then: (resolve: (v: { data: unknown[] }) => unknown) => resolve({ data: rows }),
  })
  return chain as unknown as SupabaseClient
}

describe('deriveItemSignals', () => {
  it('buckets charged history by item name and returns per-item signals', async () => {
    const t0 = Date.UTC(2026, 0, 1)
    const db = fakeDb([
      { product_id: 'p1', name: 'Coffee', qty: 1, purchases: { created_at: new Date(t0).toISOString() } },
      { product_id: 'p1', name: 'coffee', qty: 2, purchases: { created_at: new Date(t0 + 7 * DAY).toISOString() } },
      { product_id: 'p2', name: 'Chips', qty: 1, purchases: { created_at: new Date(t0).toISOString() } },
    ])
    const signals = await deriveItemSignals('hh1', db)
    expect(signals.get('coffee')?.purchaseCount).toBe(2) // case-folded together
    expect(signals.get('coffee')?.cadenceDays).toBe(7)
    expect(signals.get('chips')?.purchaseCount).toBe(1)
    expect(signals.get('chips')?.cadenceDays).toBeNull()
  })
})

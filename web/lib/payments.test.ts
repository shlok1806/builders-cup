import { describe, expect, it } from 'vitest'

import { aggregateSplitsByUser, parseSkippedItems, skippedItemPriceCents, STEPS_COLLAPSED } from './payments'

describe('aggregateSplitsByUser', () => {
  it('aggregates integer cents per user and skips zero-dollar users', () => {
    expect(
      aggregateSplitsByUser([
        { user_id: 'sam', amount_cents: 1200 },
        { user_id: 'alex', amount_cents: 0 },
        { user_id: 'sam', amount_cents: 305 },
        { user_id: 'priya', amount_cents: 499 },
        { user_id: 'alex', amount_cents: 0 },
      ]),
    ).toEqual([
      { userId: 'priya', amountCents: 499 },
      { userId: 'sam', amountCents: 1505 },
    ])
  })

  it('rejects non-integer split amounts', () => {
    expect(() => aggregateSplitsByUser([{ user_id: 'sam', amount_cents: 10.5 }])).toThrow('integer cents')
  })
})

describe('savings summary helpers', () => {
  it('parses skipped items from the persisted purchase note contract', () => {
    const skipped = parseSkippedItems(
      JSON.stringify({ skipped: [{ name: 'paper towels', reason: 'bought Tuesday', price_cents: 899 }] }),
    )

    expect(skipped).toEqual([{ name: 'paper towels', reason: 'bought Tuesday', price_cents: 899 }])
    expect(skippedItemPriceCents(skipped[0])).toBe(899)
    expect(STEPS_COLLAPSED).toBe(7)
  })

  it('treats legacy plain notes as no skipped savings instead of crashing', () => {
    expect(parseSkippedItems('demo note')).toEqual([])
  })
})

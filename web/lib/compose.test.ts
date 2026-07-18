import { describe, expect, it } from 'vitest'

import { composeHeuristic, type ComposeCandidate } from './openai'
import { offerSource } from './compose'
import type { OfferRow } from './types'

function offer(raw: unknown): OfferRow {
  return { id: 'o1', product_id: 'p1', vendor: 'Kroger', url: null, price_cents: 2400, unit: null, in_stock: true, scraped_at: '', raw }
}

describe('offerSource', () => {
  it('tags made-up fallback prices as synthetic', () => {
    expect(offerSource(offer({ synthetic: true }))).toBe('synthetic')
  })
  it('tags cached fixtures (no raw) as fixture', () => {
    expect(offerSource(offer(null))).toBe('fixture')
  })
  it('tags a real scraped listing as live', () => {
    expect(offerSource(offer({ source: 'Walmart', extracted_price: 24 }))).toBe('live')
  })
})

// composeHeuristic is the no-API composer — deterministic, so we can pin its
// ranking (running-low first, then bigger deal) and its budget trimming.
function cand(over: Partial<ComposeCandidate> & { name: string }): ComposeCandidate {
  return {
    category: 'groceries',
    unitPriceCents: 1000,
    savingsCents: 0,
    offersCount: 2,
    dueSoon: false,
    boughtRecently: false,
    ...over,
  }
}

describe('composeHeuristic', () => {
  it('skips recently bought items rather than re-buying them', () => {
    const out = composeHeuristic({
      budgetRemainingCents: 0,
      candidates: [cand({ name: 'coffee', boughtRecently: true }), cand({ name: 'chips' })],
    })
    expect(out.items.map((i) => i.name)).toEqual(['chips'])
    expect(out.skipped).toContainEqual({ name: 'coffee', reason: 'bought recently' })
  })

  it('prioritizes running-low items, then the bigger deal', () => {
    const out = composeHeuristic({
      budgetRemainingCents: 0,
      candidates: [
        cand({ name: 'small-deal' }),
        cand({ name: 'due-item', dueSoon: true }),
        cand({ name: 'big-deal', savingsCents: 500 }),
      ],
    })
    expect(out.items.map((i) => i.name)).toEqual(['due-item', 'big-deal', 'small-deal'])
    expect(out.items[0].reason).toBe('running low')
  })

  it('trims to stay within the remaining budget', () => {
    const out = composeHeuristic({
      budgetRemainingCents: 2500, // room for two $10 lines, not the third
      candidates: [cand({ name: 'a' }), cand({ name: 'b' }), cand({ name: 'c' })],
    })
    expect(out.items).toHaveLength(2)
    expect(out.skipped).toContainEqual({ name: 'c', reason: 'trimmed to stay within budget' })
  })

  it('treats a zero budget as unlimited', () => {
    const out = composeHeuristic({
      budgetRemainingCents: 0,
      candidates: [cand({ name: 'a' }), cand({ name: 'b' }), cand({ name: 'c' })],
    })
    expect(out.items).toHaveLength(3)
  })
})

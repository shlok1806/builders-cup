import { describe, expect, it } from 'vitest'

import { pickBest } from './deals'
import type { OfferRow } from './types'

let seq = 0
const offer = (price_cents: number, in_stock = true): OfferRow => ({
  id: `o${++seq}`,
  product_id: 'p1',
  vendor: 'vendor',
  url: null,
  price_cents,
  unit: null,
  in_stock,
  scraped_at: '2026-07-18T00:00:00Z',
  raw: null,
})

describe('pickBest', () => {
  it('picks the cheapest in-stock offer regardless of input order', () => {
    const best = pickBest([offer(2699), offer(2299), offer(2499)])
    expect(best?.price_cents).toBe(2299)
  })

  it('never picks an out-of-stock offer even when it is cheaper', () => {
    const best = pickBest([offer(1000, false), offer(2299, true)])
    expect(best?.price_cents).toBe(2299)
  })

  it('returns null when there are no offers', () => {
    expect(pickBest([])).toBeNull()
  })

  it('returns null when every offer is out of stock', () => {
    expect(pickBest([offer(999, false), offer(1099, false)])).toBeNull()
  })
})

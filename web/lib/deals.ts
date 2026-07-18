import { admin } from './supabase'
import type { OfferRow } from './types'

// The deterministic deal layer. No LLM ever produces a number that reaches here —
// prices come from the offers table (scraped/verified). bestOffer picks the
// cheapest in-stock offer; savingsVsSecond is what we saved by not taking the
// runner-up (the Ramp "we found you savings" number).

export async function offersFor(productId: string): Promise<OfferRow[]> {
  const db = admin()
  const { data } = await db
    .from('offers')
    .select('*')
    .eq('product_id', productId)
    .eq('in_stock', true)
    .order('price_cents', { ascending: true })
  return (data ?? []) as OfferRow[]
}

export async function bestOffer(productId: string): Promise<OfferRow | null> {
  const offers = await offersFor(productId)
  return offers[0] ?? null
}

// secondCheapest - cheapest, across in-stock offers. 0 when there's nothing to
// compare against (<2 offers). Sum this across a cart's lines for total savings.
export async function savingsVsSecond(productId: string): Promise<number> {
  const offers = await offersFor(productId)
  if (offers.length < 2) return 0
  return offers[1].price_cents - offers[0].price_cents
}

// Pick the single best deal for a set of offers already in hand (e.g. the rows
// getOffers() just returned for one need) without re-querying. Cheapest in-stock.
export function pickBest(offers: OfferRow[]): OfferRow | null {
  return offers
    .filter((o) => o.in_stock)
    .sort((a, b) => a.price_cents - b.price_cents)[0] ?? null
}

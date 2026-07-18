import { admin } from '../supabase'
import { canonicalize } from '../dedupe'
import { serpapi } from './adapters/serpapi'
import { getForQuery, normalizeQuery, synthesizeOffers } from './fixtures'
import type { Adapter, RawOffer } from './types'
import type { OfferRow } from '../types'

// Enabled price sources, in priority order. Add a real HTML scraper here later —
// the orchestrator is adapter-agnostic.
const ADAPTERS: Adapter[] = [serpapi]

// getOffers(query): run adapters in parallel, normalize, dedupe each listing to a
// canonical product, refresh that vendor's offer row, and record a scrape_run.
// Three-tier fallback so the demo never hinges on the wire:
//   1. live adapters (serpapi) — real prices
//   2. named fixtures          — cached real offers for the scripted demo prompts
//   3. synthesizeOffers        — deterministic offers for ANY query, so an
//                                off-script prompt still yields a priced cart
// The scrape_run's `adapter` records which tier served the offers (auditable).
// Returns the offer rows touched this run; callers use deals.bestOffer() to pick.
export async function getOffers(
  query: string,
  opts: { category?: string } = {}
): Promise<OfferRow[]> {
  const db = admin()
  const startedAt = new Date().toISOString()

  const results = await Promise.allSettled(ADAPTERS.map((a) => a.fetchOffers(query)))
  let raws: RawOffer[] = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  const failures = results.filter((r) => r.status === 'rejected').length

  let source = ADAPTERS.map((a) => a.name).join(',')
  if (raws.length === 0) {
    const normalized = normalizeQuery(query)
    raws = getForQuery(normalized)
    source = 'fixtures'
    if (raws.length === 0) {
      // No live offers and no named fixture — synthesize so the cart line still
      // prices out. This is what keeps the demo alive for arbitrary prompts.
      raws = synthesizeOffers(normalized)
      source = 'synthetic'
    }
  }

  const inserted: OfferRow[] = []
  const seen = new Set<string>() // product_id|vendor — one offer per vendor per run
  for (const raw of raws) {
    const productId = await canonicalize(db, raw, opts)
    const dedupeKey = `${productId}|${raw.vendor}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    // Refresh this vendor's offer for the product (keep offers = latest scrape).
    await db.from('offers').delete().eq('product_id', productId).eq('vendor', raw.vendor)
    const { data } = await db
      .from('offers')
      .insert({
        product_id: productId,
        vendor: raw.vendor,
        url: raw.url,
        price_cents: raw.priceCents,
        unit: raw.unit ?? null,
        in_stock: raw.inStock,
        raw: raw.raw ?? null,
      })
      .select('*')
      .single()
    if (data) inserted.push(data as OfferRow)
  }

  await db.from('scrape_runs').insert({
    adapter: source,
    query,
    status: failures === 0 ? 'ok' : inserted.length > 0 ? 'partial' : 'failed',
    offer_count: inserted.length,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  })

  // Provenance log — `source` tells you at a glance whether these prices are real
  // (serpapi) or a fallback (fixtures = cached demo data, synthetic = made-up).
  const cheapest = inserted.slice().sort((a, b) => a.price_cents - b.price_cents)[0]
  const tag = source === 'synthetic' ? 'SYNTHETIC (made-up)' : source === 'fixtures' ? 'fixtures (cached)' : source
  console.log(
    `[scrape] "${query}" → ${tag} · ${inserted.length} offer(s)` +
      (cheapest ? ` · cheapest ${cheapest.vendor} $${(cheapest.price_cents / 100).toFixed(2)}` : '')
  )

  return inserted
}

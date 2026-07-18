import type { RawOffer } from './types'

// Cached multi-vendor offers for the demo prompts — served when the live adapters
// return nothing (offline / rate-limited / blocked on venue wifi). Same normalized-
// key discipline as the LLM FALLBACKS map so a stray space/capital still hits.
export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ')
}

const FIXTURES: Record<string, RawOffer[]> = {
  'paper towels': [
    { vendor: 'Walmart', title: 'Bounty Select-A-Size Paper Towels 12 ct', url: null, priceCents: 2299, unit: '12 ct', inStock: true },
    { vendor: 'Target', title: 'Bounty Select-A-Size Paper Towels 12 ct', url: null, priceCents: 2499, unit: '12 ct', inStock: true },
    { vendor: 'Amazon', title: 'Bounty Select A Size Paper Towels, 12 Count', url: null, priceCents: 2699, unit: '12 count', inStock: true },
  ],
  'coffee': [
    { vendor: 'Walmart', title: 'Starbucks Pike Place Ground Coffee 28 oz', url: null, priceCents: 1549, unit: '28 oz', inStock: true },
    { vendor: 'Target', title: 'Starbucks Pike Place Ground Coffee 28 oz', url: null, priceCents: 1699, unit: '28 oz', inStock: true },
  ],
  // Tequila kept ~$52 as the cheapest offer so it still trips Sam's $40 threshold
  // in the split — the approval beat survives the scraped-cart path.
  'tequila': [
    { vendor: 'Total Wine', title: 'Casamigos Blanco Tequila 750ml', url: null, priceCents: 5200, unit: '750ml', inStock: true },
    { vendor: 'Drizly', title: 'Casamigos Blanco Tequila 750ml', url: null, priceCents: 5499, unit: '750ml', inStock: true },
    { vendor: 'BevMo', title: 'Casamigos Blanco Tequila 750 ml', url: null, priceCents: 5699, unit: '750 ml', inStock: true },
  ],
  'tortilla chips': [
    { vendor: 'Walmart', title: 'Tostitos Scoops Tortilla Chips 10 oz', url: null, priceCents: 999, unit: '10 oz', inStock: true },
    { vendor: 'Target', title: 'Tostitos Scoops Tortilla Chips 10 oz', url: null, priceCents: 1099, unit: '10 oz', inStock: true },
  ],
  'dish soap': [
    { vendor: 'Target', title: 'Dawn Ultra Dish Soap 19.4 oz', url: null, priceCents: 399, unit: '19.4 oz', inStock: true },
    { vendor: 'Walmart', title: 'Dawn Ultra Dish Soap 19.4 oz', url: null, priceCents: 449, unit: '19.4 oz', inStock: true },
  ],
}

export function getForQuery(normalized: string): RawOffer[] {
  return FIXTURES[normalized] ?? []
}

// Last-resort demo layer. When the live adapters return nothing AND there is no
// named fixture for the query, we still synthesize a deterministic multi-vendor
// offer set so every cart line prices out — the app demos end to end even on a
// dead SerpAPI key and a totally off-script prompt (no blank cart, ever).
//
// Prices are a stable hash of the normalized query, so the same need always
// yields the same cart (stable screenshots, deterministic tests). Three vendors
// at ascending prices keep the runner-up / savings math meaningful. Offers carry
// raw.synthetic so the row is auditable as demo-only, not scraped truth.
const SYNTH_VENDORS = ['Walmart', 'Target', 'Amazon', 'Costco', 'Kroger']

// FNV-1a — small, deterministic, dependency-free. Same string → same prices.
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

export function synthesizeOffers(normalized: string): RawOffer[] {
  const h = hash(normalized)
  const base = 299 + (h % 2700) // $2.99–$29.98 — a believable grocery/household range
  const step = Math.max(100, Math.round(base * 0.06)) // >=$1 apart so vendors never tie
  const start = h % SYNTH_VENDORS.length
  const title = titleCase(normalized)
  return [0, 1, 2].map((i) => ({
    vendor: SYNTH_VENDORS[(start + i) % SYNTH_VENDORS.length],
    title,
    url: null,
    priceCents: base + i * step,
    unit: null,
    inStock: true,
    raw: { synthetic: true },
  }))
}

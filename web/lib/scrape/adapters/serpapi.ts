import type { Adapter, RawOffer } from '../types'

const TIMEOUT_MS = 4000

// Google Shopping via SerpAPI — one call returns listings across many merchants,
// exactly the multi-vendor shape `offers` wants. Deterministic, real prices we
// can charge against. Returns [] on any error (missing key, timeout, non-200,
// bad JSON) so the orchestrator can fall back to cached fixtures for the demo.
export const serpapi: Adapter = {
  name: 'serpapi',
  async fetchOffers(query: string): Promise<RawOffer[]> {
    const key = process.env.SERPAPI_KEY
    if (!key) return []

    const url = new URL('https://serpapi.com/search.json')
    url.searchParams.set('engine', 'google_shopping')
    url.searchParams.set('q', query)
    url.searchParams.set('api_key', key)

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: ctrl.signal })
      if (!res.ok) return []
      const json = (await res.json()) as { shopping_results?: SerpShoppingResult[] }
      return (json.shopping_results ?? [])
        .filter((r) => typeof r.extracted_price === 'number' && !!r.source)
        .map((r) => ({
          vendor: r.source as string,
          title: r.title ?? query,
          url: r.product_link ?? r.link ?? null,
          priceCents: Math.round((r.extracted_price as number) * 100),
          unit: null,
          inStock: true,
          raw: r,
        }))
    } catch {
      return []
    } finally {
      clearTimeout(timer)
    }
  },
}

type SerpShoppingResult = {
  title?: string
  source?: string
  link?: string
  product_link?: string
  price?: string
  extracted_price?: number
}

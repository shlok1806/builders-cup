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
    if (!key) {
      // The single most common reason the demo runs on synthetic prices.
      console.warn(`[serpapi] "${query}" → SKIPPED: no SERPAPI_KEY set (using fallbacks)`)
      return []
    }

    const url = new URL('https://serpapi.com/search.json')
    url.searchParams.set('engine', 'google_shopping')
    url.searchParams.set('q', query)
    url.searchParams.set('api_key', key)

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const startedAt = Date.now()
    try {
      console.log(`[serpapi] "${query}" → calling google_shopping…`)
      const res = await fetch(url, { signal: ctrl.signal })
      const ms = Date.now() - startedAt
      if (!res.ok) {
        // 401 = bad key, 429 = out of searches — both surface here instead of a silent [].
        const body = typeof res.text === 'function' ? await res.text().catch(() => '') : ''
        console.warn(`[serpapi] "${query}" → FAILED: HTTP ${res.status} (${ms}ms) ${body.slice(0, 200)}`)
        return []
      }
      const json = (await res.json()) as { shopping_results?: SerpShoppingResult[]; error?: string }
      if (json.error) {
        // SerpAPI returns 200 with an { error } field for some quota/plan issues.
        console.warn(`[serpapi] "${query}" → FAILED: API error (${ms}ms): ${json.error}`)
        return []
      }
      const offers = (json.shopping_results ?? [])
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
      console.log(
        `[serpapi] "${query}" → OK (${ms}ms): ${json.shopping_results?.length ?? 0} results, ${offers.length} usable offer(s)`
      )
      return offers
    } catch (e) {
      const ms = Date.now() - startedAt
      const reason = ctrl.signal.aborted ? `TIMEOUT after ${TIMEOUT_MS}ms` : (e as Error).message
      console.warn(`[serpapi] "${query}" → FAILED: ${reason} (${ms}ms)`)
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

import type { Adapter, RawOffer } from '../types'

// SerpAPI does a live Google scrape on a cache-miss, which routinely takes 3–8s
// (measured 8.4s cold). The old 4s budget aborted those mid-flight and dropped us
// to synthetic prices; 12s covers the cold path.
const TIMEOUT_MS = 12000
// One retry, and ONLY for transient server-side failures (429 rate-limit, 5xx).
// A client timeout is NOT retried — SerpAPI may have already run (and charged) the
// search, so re-calling double-spends quota for nothing; the longer timeout is the
// fix there. 401 / quota / {error} won't recover, so they fail straight to fallback.
const MAX_RETRIES = 1
const RETRY_BACKOFF_MS = 1000
// Google Shopping returns ~40 listings; we only need enough to dedupe to a handful
// of vendors and pick the cheapest. Keep the top-N by relevance — the tail is
// niche/mismatched listings (e.g. a single roll when you asked for a 90-count box)
// that just add noise and DB writes. The household allowlist prunes further.
const MAX_RESULTS = 15

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
    url.searchParams.set('gl', 'us') // US storefront → stable USD pricing
    url.searchParams.set('hl', 'en')
    url.searchParams.set('api_key', key)

    // Attempt loop: at most MAX_RETRIES extra tries, gated to transient 429/5xx.
    for (let attempt = 0; ; attempt++) {
      const label = attempt === 0 ? '' : ` (retry ${attempt}/${MAX_RETRIES})`
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
      const startedAt = Date.now()
      try {
        console.log(`[serpapi] "${query}" → calling google_shopping…${label}`)
        const res = await fetch(url, { signal: ctrl.signal })
        const ms = Date.now() - startedAt
        if (!res.ok) {
          // 401 = bad key, 429 = out of searches — both surface here instead of a silent [].
          const body = typeof res.text === 'function' ? await res.text().catch(() => '') : ''
          const transient = res.status === 429 || res.status >= 500
          if (transient && attempt < MAX_RETRIES) {
            console.warn(`[serpapi] "${query}" → HTTP ${res.status} (${ms}ms), retrying in ${RETRY_BACKOFF_MS}ms…`)
            clearTimeout(timer)
            await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS))
            continue
          }
          console.warn(`[serpapi] "${query}" → FAILED: HTTP ${res.status} (${ms}ms) ${body.slice(0, 200)}`)
          return []
        }
        const json = (await res.json()) as { shopping_results?: SerpShoppingResult[]; error?: string }
        if (json.error) {
          // SerpAPI returns 200 with an { error } field for some quota/plan issues — won't recover, no retry.
          console.warn(`[serpapi] "${query}" → FAILED: API error (${ms}ms): ${json.error}`)
          return []
        }
        const offers = (json.shopping_results ?? [])
          .filter((r) => typeof r.extracted_price === 'number' && !!r.source)
          .slice(0, MAX_RESULTS) // top-N by relevance; drop the long niche tail
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
          `[serpapi] "${query}" → OK${label} (${ms}ms): ${json.shopping_results?.length ?? 0} results, kept ${offers.length} (cap ${MAX_RESULTS})`
        )
        return offers
      } catch (e) {
        const ms = Date.now() - startedAt
        // A client-side timeout is terminal: the search may already be charged, so we
        // do NOT re-call. Only the longer TIMEOUT_MS budget guards the slow-cold path.
        const reason = ctrl.signal.aborted ? `TIMEOUT after ${TIMEOUT_MS}ms` : (e as Error).message
        console.warn(`[serpapi] "${query}" → FAILED: ${reason} (${ms}ms)`)
        return []
      } finally {
        clearTimeout(timer)
      }
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

// The scraper contract. Every price source — API adapter or HTML scraper —
// implements Adapter and returns normalized RawOffers. No adapter throws into
// the request path; on any error it returns [] and the orchestrator falls back.

export type RawOffer = {
  vendor: string
  title: string
  url: string | null
  priceCents: number
  unit?: string | null
  inStock: boolean
  raw?: unknown
}

export type Adapter = {
  name: string
  fetchOffers(query: string): Promise<RawOffer[]>
}

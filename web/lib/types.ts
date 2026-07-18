// Split-engine types — the P3 contract (architecture.md §12).
// DB row types get added here in Phase 0; this is the engine slice.

export type Member = {
  userId: string
  weight: number // default 1
  excludedCategories: string[]
  excludedItems: string[] // lowercase keywords; matched as a substring of the item name
  approvalThresholdCents: number | null
}
export type Line = { itemId: string; name: string; category: string; lineTotalCents: number }
export type Allocation = { itemId: string; userId: string; amountCents: number }
export type Flag = { itemId: string; approverId: string; rule: string }
export type SplitResult = { allocations: Allocation[]; flagged: Flag[] }

// --- Procurement layer (migration 0002) ---
// products is now the canonical item; a product has many offers (one per vendor).
// Best deal = cheapest in_stock offer. No LLM-asserted price ever lands here.

export type OfferRow = {
  id: string
  product_id: string
  vendor: string
  url: string | null
  price_cents: number
  unit: string | null
  in_stock: boolean
  scraped_at: string
  raw: unknown | null
}

// Drives the autonomous restock agent: which recurring items are due to reorder.
export type RestockSubscriptionRow = {
  id: string
  household_id: string
  product_id: string
  cadence_days: number
  lead_days: number
  last_purchased_at: string | null
  enabled: boolean
  created_at: string
}

// Scrape provenance / cache freshness.
export type ScrapeRunRow = {
  id: string
  adapter: string
  query: string | null
  status: 'ok' | 'partial' | 'failed'
  offer_count: number
  started_at: string
  finished_at: string | null
}

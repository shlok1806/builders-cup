import { admin } from './supabase'

// The restock predictor — what the autonomous agent watches. A recurring item is
// "due" when now + horizon has reached last_purchased_at + cadence - lead time.
// Cadence is seeded on restock_subscriptions; deriveCadenceDays() computes it from
// purchase history so subscriptions can be created/kept honest over time.

const DAY_MS = 24 * 60 * 60 * 1000

export type DueItem = {
  productId: string
  name: string
  category: string
  cadenceDays: number
  lastPurchasedAt: string | null
  dueDate: string | null
}

// Mean days between this household's purchases of a product. null if <2 buys.
export async function deriveCadenceDays(
  householdId: string,
  productId: string
): Promise<number | null> {
  const db = admin()
  const { data } = await db
    .from('purchase_items')
    .select('product_id, purchases!inner(created_at, household_id)')
    .eq('product_id', productId)
    .eq('purchases.household_id', householdId)

  type Row = { purchases: { created_at: string } | { created_at: string }[] }
  const dates = ((data ?? []) as unknown as Row[])
    .map((r) => (Array.isArray(r.purchases) ? r.purchases[0] : r.purchases)?.created_at)
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime())
    .sort((a, b) => a - b)
  if (dates.length < 2) return null

  let gaps = 0
  for (let i = 1; i < dates.length; i++) gaps += dates[i] - dates[i - 1]
  return Math.round(gaps / (dates.length - 1) / DAY_MS)
}

// Items the household is about to run out of within `horizonDays`. Drives the
// weekly auto-restock draft.
export async function dueItems(householdId: string, horizonDays = 7): Promise<DueItem[]> {
  const db = admin()
  const { data } = await db
    .from('restock_subscriptions')
    .select('product_id, cadence_days, lead_days, last_purchased_at, products(name, category)')
    .eq('household_id', householdId)
    .eq('enabled', true)

  type Row = {
    product_id: string
    cadence_days: number
    lead_days: number
    last_purchased_at: string | null
    products: { name: string; category: string } | { name: string; category: string }[] | null
  }
  const rows = (data ?? []) as unknown as Row[]
  const horizon = Date.now() + horizonDays * DAY_MS

  const due: DueItem[] = []
  for (const r of rows) {
    const product = Array.isArray(r.products) ? r.products[0] : r.products
    const name = product?.name ?? 'item'
    const category = product?.category ?? 'household'
    if (!r.last_purchased_at) {
      // Never recorded a purchase — treat as due now so it isn't stuck forever.
      due.push({ productId: r.product_id, name, category, cadenceDays: r.cadence_days, lastPurchasedAt: null, dueDate: null })
      continue
    }
    const last = new Date(r.last_purchased_at).getTime()
    const dueAt = last + (r.cadence_days - r.lead_days) * DAY_MS
    if (horizon >= dueAt) {
      due.push({
        productId: r.product_id,
        name,
        category,
        cadenceDays: r.cadence_days,
        lastPurchasedAt: r.last_purchased_at,
        dueDate: new Date(dueAt).toISOString(),
      })
    }
  }
  return due
}

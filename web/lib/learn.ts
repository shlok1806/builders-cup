import { admin } from './supabase'
import { deriveCadenceDays } from './restock'

// The learning loop that backs "the restock gets better the more you buy". Two halves:
//
//   1. recordPurchaseLearnings — write-back. Called when a purchase is charged; it keeps
//      the household's restock model honest by advancing last_purchased_at, recomputing
//      cadence from real history, and auto-subscribing anything the house has now bought
//      twice. This is the ONLY persisted state; without it the predictor never advances.
//
//   2. deriveItemSignals — runtime signal. Derived fresh from purchase history each cart
//      build (never stored) and injected into the composer's context so the autonomous
//      cart converges on what the house actually keeps buying. High confidence + a stable
//      cadence is what lets approval become a rubber stamp.
//
// It NEVER charges and NEVER changes the whole-cart approval gate — "more autonomous"
// means the cart's contents need less human curation, not that money moves unattended.

const DAY_MS = 24 * 60 * 60 * 1000

export type ItemSignal = {
  purchaseCount: number // distinct charged purchases that included this item
  typicalQty: number // median qty across those purchases (>= 1)
  cadenceDays: number | null // mean days between buys, null if < 2 buys
  confidence: number // 0..1 — how sure we are this is a standing need
}

// --- Pure helpers (unit-tested without a DB) ---

export function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Confidence blends two things: how OFTEN the house has bought the item (a single buy is
// not a habit) and how REGULAR the spacing is (a steady cadence we can predict beats an
// erratic one). Count saturates at 3 buys; regularity comes from the gaps' coefficient of
// variation (lower spread → more predictable). Deterministic, no ML.
export function confidenceScore(purchaseCount: number, gapDays: number[]): number {
  if (purchaseCount <= 0) return 0
  const countScore = Math.min(1, purchaseCount / 3)
  let regularity = 0.6 // unknown spacing (0 or 1 gap) → neutral-ish
  if (gapDays.length >= 2) {
    const mean = gapDays.reduce((a, b) => a + b, 0) / gapDays.length
    if (mean > 0) {
      const variance = gapDays.reduce((a, g) => a + (g - mean) ** 2, 0) / gapDays.length
      const cv = Math.sqrt(variance) / mean // coefficient of variation
      regularity = Math.max(0, Math.min(1, 1 - cv))
    }
  }
  return Math.round(countScore * (0.5 + 0.5 * regularity) * 100) / 100
}

// Turn one item's purchase timeline (buy timestamps in ms + the qty each time) into a
// signal. Exported so the confidence/cadence math is testable in isolation.
export function signalFromHistory(buyTimesMs: number[], qtys: number[]): ItemSignal {
  const times = [...buyTimesMs].sort((a, b) => a - b)
  const purchaseCount = times.length
  const gapDays: number[] = []
  for (let i = 1; i < times.length; i++) gapDays.push((times[i] - times[i - 1]) / DAY_MS)
  const cadenceDays =
    gapDays.length > 0 ? Math.round(gapDays.reduce((a, b) => a + b, 0) / gapDays.length) : null
  return {
    purchaseCount,
    typicalQty: Math.max(1, Math.round(median(qtys)) || 1),
    cadenceDays,
    confidence: confidenceScore(purchaseCount, gapDays),
  }
}

// --- DB-backed functions ---

type HistoryRow = {
  product_id: string | null
  name: string
  qty: number
  purchases: { created_at: string } | { created_at: string }[] | null
}

async function chargedHistory(
  db: ReturnType<typeof admin>,
  householdId: string,
): Promise<HistoryRow[]> {
  const { data } = await db
    .from('purchase_items')
    .select('product_id, name, qty, purchases!inner(created_at, household_id, status)')
    .eq('purchases.household_id', householdId)
    .eq('purchases.status', 'charged')
  return (data ?? []) as unknown as HistoryRow[]
}

const createdAt = (r: HistoryRow): string | null =>
  (Array.isArray(r.purchases) ? r.purchases[0] : r.purchases)?.created_at ?? null

// Runtime signal map keyed by lowercased item name — injected into the composer context.
// Derived fresh from charged history every build; nothing is persisted here.
export async function deriveItemSignals(
  householdId: string,
  db = admin(),
): Promise<Map<string, ItemSignal>> {
  const rows = await chargedHistory(db, householdId)
  const byName = new Map<string, { times: number[]; qtys: number[] }>()
  for (const r of rows) {
    const at = createdAt(r)
    if (!at) continue
    const key = r.name.toLowerCase()
    const bucket = byName.get(key) ?? { times: [], qtys: [] }
    bucket.times.push(new Date(at).getTime())
    bucket.qtys.push(r.qty)
    byName.set(key, bucket)
  }
  const out = new Map<string, ItemSignal>()
  for (const [key, { times, qtys }] of byName) {
    out.set(key, signalFromHistory(times, qtys))
  }
  return out
}

// Write-back: called after a purchase is charged. Advances the restock model so the
// predictor keeps improving. Idempotent — re-running on the same charged purchase just
// rewrites the same values. Never throws in a way that should roll back the charge; the
// caller wraps it and treats learning as best-effort.
export async function recordPurchaseLearnings(
  householdId: string,
  purchaseId: string,
  db = admin(),
): Promise<{ updated: number; subscribed: number }> {
  const { data: items } = await db
    .from('purchase_items')
    .select('product_id')
    .eq('purchase_id', purchaseId)
  const productIds = [
    ...new Set(
      ((items ?? []) as { product_id: string | null }[])
        .map((i) => i.product_id)
        .filter((p): p is string => !!p),
    ),
  ]
  if (productIds.length === 0) return { updated: 0, subscribed: 0 }

  // How many times the household has bought each product (across all charged history) —
  // an item bought >= 2 times becomes a tracked recurring need.
  const history = await chargedHistory(db, householdId)
  const buyCount = new Map<string, number>()
  for (const r of history) {
    if (!r.product_id) continue
    buyCount.set(r.product_id, (buyCount.get(r.product_id) ?? 0) + 1)
  }

  // Which of these products already have a subscription.
  const { data: existing } = await db
    .from('restock_subscriptions')
    .select('product_id')
    .eq('household_id', householdId)
    .in('product_id', productIds)
  const subscribed = new Set(
    ((existing ?? []) as { product_id: string }[]).map((r) => r.product_id),
  )

  const now = new Date().toISOString()
  let updated = 0
  let created = 0
  for (const productId of productIds) {
    const cadence = await deriveCadenceDays(householdId, productId)
    if (subscribed.has(productId)) {
      // Keep the existing subscription fresh; only overwrite cadence when history gives one.
      const patch: Record<string, unknown> = { last_purchased_at: now }
      if (cadence != null) patch.cadence_days = cadence
      await db
        .from('restock_subscriptions')
        .update(patch)
        .eq('household_id', householdId)
        .eq('product_id', productId)
      updated++
    } else if ((buyCount.get(productId) ?? 0) >= 2) {
      // Auto-subscribe: a real repeat purchase is now a standing need. Fall back to the
      // household's median cadence guess (30d) until history pins it down.
      await db.from('restock_subscriptions').insert({
        household_id: householdId,
        product_id: productId,
        cadence_days: cadence ?? 30,
        last_purchased_at: now,
        enabled: true,
      })
      created++
    }
    // Single-buy, unsubscribed items are intentionally left untracked — one buy isn't a habit.
  }
  return { updated, subscribed: created }
}

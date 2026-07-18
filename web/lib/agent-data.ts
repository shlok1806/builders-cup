// Data-access for the P2 agent routes — Supabase-backed (was an in-memory
// fixture; swapped per its own header once Phase 0 landed). Signatures are
// unchanged so app/api/cart/build and app/api/policy/compile never had to move.
//
// All reads/writes go through the service-role client (RLS bypassed). The
// household is resolved from the single seeded row, so callers no longer need
// to pass a household id (the optional arg is ignored).

import { admin } from './supabase'

// Lazily-initialized service-role client. Must NOT run at module load: route
// files that import this get their page data collected during `next build`,
// where Supabase env vars are absent and `admin()` would throw
// "supabaseUrl is required". Memoized so we still reuse one client per process.
let _db: ReturnType<typeof admin> | null = null
const db = () => (_db ??= admin())

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

/** The demo has exactly one household; resolve its id once per call. */
async function resolveHousehold(): Promise<string> {
  const { data, error } = await db().from('households').select('id').limit(1).single()
  if (error || !data) throw new Error('no household seeded — run `npm run seed`')
  return data.id
}

export type CatalogEntry = {
  id: string
  name: string
  category: string
  price_cents: number
}

export type PurchaseItemInput = { product_id: string; qty: number }

export type PurchaseItemRow = {
  id: string
  purchase_id: string
  product_id: string
  name: string
  qty: number
  unit_price_cents: number
  category: string
}

export type PolicyRow = {
  id: string
  user_id: string
  household_id: string
  type: string
  params: Record<string, unknown>
  source_text: string
}

// --- reads ------------------------------------------------------------------

/** Full catalog the cart builder is constrained to. */
export async function getCatalog(): Promise<CatalogEntry[]> {
  const { data, error } = await db().from('products').select('id, name, category, price_cents')
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Recent purchase item names for the household (last 14 days), fed to the cart
 * builder for dedupe. Filters on purchases.created_at (the order date).
 */
export async function getRecentPurchaseNames(): Promise<string[]> {
  const householdId = await resolveHousehold()
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await db()
    .from('purchase_items')
    .select('name, purchases!inner(household_id, created_at)')
    .eq('purchases.household_id', householdId)
    .gte('purchases.created_at', cutoff)
  if (error) throw new Error(error.message)
  return [...new Set((data ?? []).map((r) => r.name as string))]
}

// --- writes -----------------------------------------------------------------

/** Insert a `building` purchase; returns its id. */
export async function createBuildingPurchase(input: {
  householdId?: string
  createdBy: string
  note: string
}): Promise<string> {
  const householdId = await resolveHousehold()
  const { data, error } = await db()
    .from('purchases')
    .insert({
      household_id: householdId,
      status: 'building',
      note: input.note,
      // created_by is a users FK; the frontend has no auth, so only keep it
      // when it's a real user id (else null).
      created_by: isUuid(input.createdBy) ? input.createdBy : null,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'failed to create purchase')
  return data.id
}

/**
 * Inserts one purchase_items row per validated cart item (copying name /
 * category / unit_price_cents from the catalog), stores subtotal_cents on the
 * purchase, and returns the created rows + subtotal.
 */
export async function insertPurchaseItems(
  purchaseId: string,
  items: PurchaseItemInput[],
): Promise<{ rows: PurchaseItemRow[]; subtotalCents: number }> {
  if (items.length === 0) return { rows: [], subtotalCents: 0 }

  const { data: products, error: prodErr } = await db()
    .from('products')
    .select('id, name, category, price_cents')
    .in(
      'id',
      items.map((i) => i.product_id),
    )
  if (prodErr) throw new Error(prodErr.message)
  const byId = new Map((products ?? []).map((p) => [p.id, p]))

  const toInsert = items
    .map((item) => {
      const p = byId.get(item.product_id)
      if (!p) return null // defense in depth; buildCart already rejects unknown ids
      return {
        purchase_id: purchaseId,
        product_id: p.id,
        name: p.name,
        qty: item.qty,
        unit_price_cents: p.price_cents,
        category: p.category,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  const { data: rows, error: insErr } = await db()
    .from('purchase_items')
    .insert(toInsert)
    .select('id, purchase_id, product_id, name, qty, unit_price_cents, category')
  if (insErr) throw new Error(insErr.message)

  const subtotalCents = (rows ?? []).reduce((s, r) => s + r.unit_price_cents * r.qty, 0)
  await db().from('purchases').update({ subtotal_cents: subtotalCents }).eq('id', purchaseId)

  return { rows: (rows ?? []) as PurchaseItemRow[], subtotalCents }
}

/** Insert one compiled policy row; returns it. */
export async function insertPolicy(input: {
  userId: string
  householdId?: string
  type: string
  params: Record<string, unknown>
  source_text: string
}): Promise<PolicyRow> {
  const householdId = await resolveHousehold()
  const { data, error } = await db()
    .from('policies')
    .insert({
      user_id: input.userId,
      household_id: householdId,
      type: input.type,
      params: input.params,
      source_text: input.source_text,
    })
    .select('id, user_id, household_id, type, params, source_text')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'failed to insert policy')
  return data as PolicyRow
}

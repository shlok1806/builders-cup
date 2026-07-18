import { admin } from './supabase'
import { dueItems } from './restock'
import { bestOffer } from './deals'
import { runSplit } from './split-run'

// The autonomous agent — Ramp's agentic procurement for a household. It predicts
// what's about to run out, sources the cheapest offer for each, drafts the cart,
// and runs the deterministic split. Then it STOPS: the cart is always left at
// awaiting_approval behind a whole-cart approval, so it can NEVER charge a card
// without a human tap. It respects the monthly budget as a spend control.

export type AutoRestockResult = {
  purchaseId: string | null
  dueCount: number
  lineCount: number
  subtotalCents: number
  overBudget: boolean
}

async function monthSpendCents(db: ReturnType<typeof admin>, householdId: string): Promise<number> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { data } = await db
    .from('item_splits')
    .select('amount_cents, purchase_items!inner(purchases!inner(household_id, created_at))')
    .eq('purchase_items.purchases.household_id', householdId)
    .gte('purchase_items.purchases.created_at', monthStart)
  return ((data ?? []) as { amount_cents: number }[]).reduce((s, r) => s + r.amount_cents, 0)
}

export async function runAutoRestock(householdId: string): Promise<AutoRestockResult> {
  const db = admin()
  const due = await dueItems(householdId)
  if (due.length === 0) {
    return { purchaseId: null, dueCount: 0, lineCount: 0, subtotalCents: 0, overBudget: false }
  }

  // The house manager who approves the weekly cart (first seeded user, no auth).
  const { data: manager } = await db
    .from('users')
    .select('id')
    .eq('household_id', householdId)
    .order('id', { ascending: true })
    .limit(1)
    .single()

  const { data: budgetRow } = await db
    .from('households')
    .select('monthly_budget_cents')
    .eq('id', householdId)
    .single()
  const budgetCents = budgetRow?.monthly_budget_cents ?? 0

  const { data: purchase } = await db
    .from('purchases')
    .insert({ household_id: householdId, status: 'building', subtotal_cents: 0, note: 'auto-restock', created_by: manager?.id })
    .select('id')
    .single()
  const purchaseId = purchase!.id as string

  // Category per due product (purchase_items.category is NOT NULL).
  const { data: prods } = await db
    .from('products')
    .select('id, category')
    .in('id', due.map((d) => d.productId))
  const catById = new Map((prods ?? []).map((p) => [p.id as string, p.category as string]))

  let subtotal = 0
  let lineCount = 0
  for (const item of due) {
    const best = await bestOffer(item.productId)
    if (!best) continue
    await db.from('purchase_items').insert({
      purchase_id: purchaseId,
      product_id: item.productId,
      name: item.name,
      qty: 1,
      unit_price_cents: best.price_cents,
      category: catById.get(item.productId) ?? 'household',
      offer_id: best.id,
    })
    subtotal += best.price_cents
    lineCount++
  }

  await db.from('purchases').update({ subtotal_cents: subtotal }).eq('id', purchaseId)

  // Deterministic split — writes item_splits + any per-line (threshold) approvals.
  await runSplit(purchaseId)

  // Budget control + the hard invariant: always gate the whole auto-cart behind a
  // human approval, even when no individual line tripped a threshold. Checkout is
  // gated on zero pending approvals, so this makes unattended charging impossible.
  const spend = await monthSpendCents(db, householdId)
  const overBudget = budgetCents > 0 && spend > budgetCents
  await db.from('approvals').insert({
    purchase_id: purchaseId,
    purchase_item_id: null,
    approver_id: manager?.id,
    rule: overBudget
      ? 'auto-restock cart exceeds the monthly budget — approve to proceed'
      : 'auto-restock weekly cart — approve to proceed',
    status: 'pending',
  })
  await db.from('purchases').update({ status: 'awaiting_approval' }).eq('id', purchaseId)

  return { purchaseId, dueCount: due.length, lineCount, subtotalCents: subtotal, overBudget }
}

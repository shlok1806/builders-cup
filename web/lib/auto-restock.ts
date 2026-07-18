import { admin } from './supabase'
import { dueItems } from './restock'
import { planCart } from './compose'
import { runSplit } from './split-run'

// The autonomous agent — Ramp's agentic procurement for a household. It predicts
// what's about to run out, then hands those due items to the shared composer
// (planCart), which sources the cheapest offer for each and lets the LLM compose
// the cart within the monthly budget. It drafts, runs the deterministic split, and
// STOPS: the cart is always left at awaiting_approval behind a whole-cart approval,
// so it can NEVER charge a card without a human tap.

export type AutoRestockResult = {
  purchaseId: string | null
  dueCount: number
  lineCount: number
  subtotalCents: number
  overBudget: boolean
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

  // Compose the cart: source cheapest offers for the due items and let the
  // composer pick/quantify within the monthly budget. dueNames marks them all as
  // running-low so the composer prioritizes them.
  const plan = await planCart({
    householdId,
    seeds: due.map((d) => ({ name: d.name, category: d.category })),
    dueNames: new Set(due.map((d) => d.name.toLowerCase())),
  })

  const { data: purchase } = await db
    .from('purchases')
    .insert({ household_id: householdId, status: 'building', subtotal_cents: plan.subtotalCents, note: 'auto-restock', created_by: manager?.id })
    .select('id')
    .single()
  const purchaseId = purchase!.id as string

  for (const line of plan.lines) {
    await db.from('purchase_items').insert({
      purchase_id: purchaseId,
      product_id: line.best.product_id,
      name: line.name,
      qty: line.qty,
      unit_price_cents: line.best.price_cents,
      category: line.category,
      offer_id: line.best.id,
    })
  }
  const subtotal = plan.subtotalCents
  const lineCount = plan.lines.length

  // Deterministic split — writes item_splits + any per-line (threshold) approvals.
  await runSplit(purchaseId)

  // Budget control + the hard invariant: always gate the whole auto-cart behind a
  // human approval, even when no individual line tripped a threshold. Checkout is
  // gated on zero pending approvals, so this makes unattended charging impossible.
  const overBudget = plan.overBudget
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

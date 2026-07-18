import { admin } from './supabase'
import { computeSplit } from './split'
import type { Member, Line } from './types'

// Shared split logic — called by POST /api/purchase/[id]/split and by the
// decline path of POST /api/approval/[id]. Loads the purchase's items + the
// household's policies, folds policies into Member[], runs the deterministic
// engine, and rewrites item_splits + pending approvals. Returns the split view.

export type SplitLineView = {
  itemId: string
  name: string
  category: string
  lineTotalCents: number
  splits: { userId: string; amountCents: number }[]
  flag?: { approverId: string; rule: string }
}

export async function runSplit(purchaseId: string): Promise<SplitLineView[]> {
  const db = admin()

  const { data: purchase } = await db
    .from('purchases')
    .select('id, household_id')
    .eq('id', purchaseId)
    .single()
  if (!purchase) throw new Error(`purchase ${purchaseId} not found`)

  const { data: items } = await db
    .from('purchase_items')
    .select('id, name, qty, unit_price_cents, category')
    .eq('purchase_id', purchaseId)
  const { data: users } = await db
    .from('users')
    .select('id')
    .eq('household_id', purchase.household_id)
  const { data: policies } = await db
    .from('policies')
    .select('user_id, type, params')
    .eq('household_id', purchase.household_id)

  const itemRows = items ?? []
  // Fold each user's policies into a Member. Sort by userId so "first matching
  // threshold owns the approval" (§12) is deterministic, not DB row order.
  const members: Member[] = (users ?? [])
    .map((u) => {
      const mine = (policies ?? []).filter((p) => p.user_id === u.id)
      const weightP = mine.find((p) => p.type === 'split_weight')
      const threshP = mine.find((p) => p.type === 'approval_threshold')
      return {
        userId: u.id,
        weight: (weightP?.params as { weight?: number })?.weight ?? 1,
        excludedCategories: mine
          .filter((p) => p.type === 'exclude_category')
          .map((p) => (p.params as { category: string }).category),
        approvalThresholdCents:
          (threshP?.params as { amount_cents?: number })?.amount_cents ?? null,
      }
    })
    .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))

  const lines: Line[] = itemRows.map((it) => ({
    itemId: it.id,
    category: it.category,
    lineTotalCents: it.unit_price_cents * it.qty, // always multiply — never unit price alone
  }))

  const { allocations, flagged } = computeSplit(lines, members)

  // Rewrite item_splits for these items (idempotent re-run).
  const itemIds = itemRows.map((it) => it.id)
  if (itemIds.length) await db.from('item_splits').delete().in('purchase_item_id', itemIds)
  if (allocations.length)
    await db.from('item_splits').insert(
      allocations.map((a) => ({
        purchase_item_id: a.itemId,
        user_id: a.userId,
        amount_cents: a.amountCents,
      }))
    )

  // Replace pending approvals (keep approved/declined history untouched).
  await db.from('approvals').delete().eq('purchase_id', purchaseId).eq('status', 'pending')
  if (flagged.length)
    await db.from('approvals').insert(
      flagged.map((f) => ({
        purchase_id: purchaseId,
        purchase_item_id: f.itemId,
        approver_id: f.approverId,
        rule: f.rule,
        status: 'pending',
      }))
    )

  await db
    .from('purchases')
    .update({ status: flagged.length ? 'awaiting_approval' : 'building' })
    .eq('id', purchaseId)

  // Assemble the split-view payload (join names + flags).
  const flagByItem = new Map(flagged.map((f) => [f.itemId, f]))
  return itemRows.map((it) => {
    const f = flagByItem.get(it.id)
    return {
      itemId: it.id,
      name: it.name,
      category: it.category,
      lineTotalCents: it.unit_price_cents * it.qty,
      splits: allocations
        .filter((a) => a.itemId === it.id)
        .map((a) => ({ userId: a.userId, amountCents: a.amountCents })),
      ...(f ? { flag: { approverId: f.approverId, rule: f.rule } } : {}),
    }
  })
}

// Sum of unit_price_cents × qty across a purchase's items — used to keep
// purchases.subtotal_cents correct after a decline removes a line.
export async function recomputeSubtotal(purchaseId: string): Promise<number> {
  const db = admin()
  const { data: items } = await db
    .from('purchase_items')
    .select('qty, unit_price_cents')
    .eq('purchase_id', purchaseId)
  const subtotal = (items ?? []).reduce((s, it) => s + it.unit_price_cents * it.qty, 0)
  await db.from('purchases').update({ subtotal_cents: subtotal }).eq('id', purchaseId)
  return subtotal
}

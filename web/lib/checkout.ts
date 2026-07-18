import type { SupabaseClient } from '@supabase/supabase-js'

import { aggregateSplitsByUser } from '@/lib/payments'
import { admin } from '@/lib/supabase'

export type CheckoutResult =
  | { status: 200; body: { completed: true } }
  | { status: 404 | 409 | 500; body: { error: string } }

type PurchaseRow = {
  id: string
  status: string
}

type SplitRow = {
  user_id: string
  amount_cents: number
}

// Completion is intentionally internal: it records an agreed household purchase
// after every approval is resolved. It never creates an external payment.
export async function checkoutPurchase(purchaseId: string, supabase = admin()): Promise<CheckoutResult> {
  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .select('id,status')
    .eq('id', purchaseId)
    .single<PurchaseRow>()

  if (purchaseError || !purchase) {
    return { status: 404, body: { error: 'Purchase not found' } }
  }

  if (purchase.status === 'charged') {
    return { status: 200, body: { completed: true } }
  }

  const { count: pendingApprovals, error: approvalsError } = await supabase
    .from('approvals')
    .select('id', { count: 'exact', head: true })
    .eq('purchase_id', purchaseId)
    .eq('status', 'pending')

  if (approvalsError) {
    return { status: 500, body: { error: approvalsError.message } }
  }

  if ((pendingApprovals ?? 0) > 0) {
    return { status: 409, body: { error: 'Purchase still has pending approvals' } }
  }

  const { data: splitRows, error: splitError } = await supabase
    .from('item_splits')
    .select('user_id,amount_cents,purchase_items!inner(purchase_id)')
    .eq('purchase_items.purchase_id', purchaseId)
    .returns<SplitRow[]>()

  if (splitError) {
    return { status: 500, body: { error: splitError.message } }
  }

  if (aggregateSplitsByUser(splitRows ?? []).length === 0) {
    return { status: 409, body: { error: 'No positive item splits to record' } }
  }

  const { error: updateError } = await supabase
    .from('purchases')
    .update({ status: 'charged' })
    .eq('id', purchaseId)

  if (updateError) {
    return { status: 500, body: { error: updateError.message } }
  }

  return { status: 200, body: { completed: true } }
}

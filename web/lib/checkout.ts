import type { SupabaseClient } from '@supabase/supabase-js'

import { aggregateSplitsByUser, type CheckoutCharge } from '@/lib/payments'
import { admin } from '@/lib/supabase'
import { chargeUser, type ChargeUserResult } from '@/lib/stripe'

export type CheckoutResult =
  | { status: 200; body: { charges: CheckoutCharge[] } }
  | { status: 404 | 409 | 500; body: { error: string } }

type PurchaseRow = {
  id: string
  status: string
}

type ChargeRow = {
  user_id: string
  amount_cents: number
  status: 'succeeded' | 'failed'
  stripe_payment_intent_id: string | null
}

type ExistingChargeRow = {
  id: string
  user_id: string
  amount_cents: number
}

type SplitRow = {
  user_id: string
  amount_cents: number
}

type PaymentMethodRow = {
  user_id: string
  stripe_customer_id: string
  stripe_pm_id: string
}

// Charges only after every approval is resolved. It is shared by the explicit
// checkout endpoint and the final approval decision so neither path can bypass
// the approval gate.
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
    try {
      return { status: 200, body: { charges: await existingCharges(supabase, purchaseId) } }
    } catch (error) {
      return { status: 500, body: { error: (error as Error).message } }
    }
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

  const totals = aggregateSplitsByUser(splitRows ?? [])
  if (totals.length === 0) {
    return { status: 409, body: { error: 'No positive item splits to charge' } }
  }

  const { data: paymentMethods, error: paymentMethodError } = await supabase
    .from('payment_methods')
    .select('user_id,stripe_customer_id,stripe_pm_id')
    .in(
      'user_id',
      totals.map((total) => total.userId),
    )
    .returns<PaymentMethodRow[]>()

  if (paymentMethodError) {
    return { status: 500, body: { error: paymentMethodError.message } }
  }

  const paymentMethodByUser = new Map((paymentMethods ?? []).map((method) => [method.user_id, method]))
  const charges: CheckoutCharge[] = []

  for (const total of totals) {
    const paymentMethod = paymentMethodByUser.get(total.userId)
    if (!paymentMethod) {
      charges.push({
        userId: total.userId,
        amountCents: total.amountCents,
        status: 'failed',
        stripePaymentIntentId: null,
        failureMessage: 'No payment method is saved for this member',
      })
      continue
    }

    let result: ChargeUserResult
    try {
      result = await chargeUser(
        paymentMethod.stripe_customer_id,
        paymentMethod.stripe_pm_id,
        total.amountCents,
        `${purchaseId}:${total.userId}:${total.amountCents}`,
      )
    } catch {
      result = { piId: null, status: 'failed', failureMessage: 'Stripe could not complete the payment' }
    }

    charges.push({
      userId: total.userId,
      amountCents: total.amountCents,
      status: result.status,
      stripePaymentIntentId: result.piId,
      ...(result.failureMessage ? { failureMessage: result.failureMessage } : {}),
    })
  }

  const chargeRows = charges.map((charge) => ({
    purchase_id: purchaseId,
    user_id: charge.userId,
    amount_cents: charge.amountCents,
    stripe_payment_intent_id: charge.stripePaymentIntentId,
    status: charge.status,
  }))

  const { data: existingChargeRows, error: chargeSelectError } = await supabase
    .from('charges')
    .select('id,user_id,amount_cents')
    .eq('purchase_id', purchaseId)
    .order('created_at', { ascending: true })
    .returns<ExistingChargeRow[]>()

  if (chargeSelectError) {
    return { status: 500, body: { error: chargeSelectError.message } }
  }

  const existingChargeIdByKey = new Map<string, string>()
  for (const row of existingChargeRows ?? []) {
    const key = `${row.user_id}:${row.amount_cents}`
    if (!existingChargeIdByKey.has(key)) {
      existingChargeIdByKey.set(key, row.id)
    }
  }

  const updates: Array<{ id: string; charge: (typeof chargeRows)[number] }> = []
  const inserts: Array<(typeof chargeRows)[number]> = []
  for (const charge of chargeRows) {
    const existingId = existingChargeIdByKey.get(`${charge.user_id}:${charge.amount_cents}`)
    if (existingId) {
      updates.push({ id: existingId, charge })
    } else {
      inserts.push(charge)
    }
  }

  for (const { id, charge } of updates) {
    const { error: updateError } = await supabase
      .from('charges')
      .update({
        stripe_payment_intent_id: charge.stripe_payment_intent_id,
        status: charge.status,
      })
      .eq('id', id)

    if (updateError) {
      return { status: 500, body: { error: updateError.message } }
    }
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from('charges').insert(inserts)
    if (insertError) {
      return { status: 500, body: { error: insertError.message } }
    }
  }

  if (charges.every((charge) => charge.status === 'succeeded')) {
    const { error: updateError } = await supabase.from('purchases').update({ status: 'charged' }).eq('id', purchaseId)

    if (updateError) {
      return { status: 500, body: { error: updateError.message } }
    }
  }

  return { status: 200, body: { charges } }
}

async function existingCharges(supabase: SupabaseClient, purchaseId: string): Promise<CheckoutCharge[]> {
  const { data, error } = await supabase
    .from('charges')
    .select('user_id,amount_cents,status,stripe_payment_intent_id')
    .eq('purchase_id', purchaseId)
    .order('created_at', { ascending: true })
    .returns<ChargeRow[]>()

  if (error) {
    throw error
  }

  return (data ?? []).map((charge) => ({
    userId: charge.user_id,
    amountCents: charge.amount_cents,
    status: charge.status,
    stripePaymentIntentId: charge.stripe_payment_intent_id,
  }))
}

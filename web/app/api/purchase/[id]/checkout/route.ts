import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

import { aggregateSplitsByUser, type CheckoutCharge } from '@/lib/payments'
import { admin } from '@/lib/supabase'
import { chargeUser, type ChargeUserResult } from '@/lib/stripe'

type RouteContext = {
  params: Promise<{ id: string }>
}

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

type SplitRow = {
  user_id: string
  amount_cents: number
}

type PaymentMethodRow = {
  user_id: string
  stripe_customer_id: string
  stripe_pm_id: string
}

export async function POST(_request: Request, context: RouteContext) {
  const { id: purchaseId } = await context.params
  const supabase = admin()

  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .select('id,status')
    .eq('id', purchaseId)
    .single<PurchaseRow>()

  if (purchaseError || !purchase) {
    return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })
  }

  if (purchase.status === 'charged') {
    const charges = await existingCharges(supabase, purchaseId)
    return NextResponse.json({ charges })
  }

  const { count: pendingApprovals, error: approvalsError } = await supabase
    .from('approvals')
    .select('id', { count: 'exact', head: true })
    .eq('purchase_id', purchaseId)
    .eq('status', 'pending')

  if (approvalsError) {
    return NextResponse.json({ error: approvalsError.message }, { status: 500 })
  }

  if ((pendingApprovals ?? 0) > 0) {
    return NextResponse.json({ error: 'Purchase still has pending approvals' }, { status: 409 })
  }

  const { data: splitRows, error: splitError } = await supabase
    .from('item_splits')
    .select('user_id,amount_cents,purchase_items!inner(purchase_id)')
    .eq('purchase_items.purchase_id', purchaseId)
    .returns<SplitRow[]>()

  if (splitError) {
    return NextResponse.json({ error: splitError.message }, { status: 500 })
  }

  const totals = aggregateSplitsByUser(splitRows ?? [])
  if (totals.length === 0) {
    return NextResponse.json({ error: 'No positive item splits to charge' }, { status: 409 })
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
    return NextResponse.json({ error: paymentMethodError.message }, { status: 500 })
  }

  const paymentMethodByUser = new Map((paymentMethods ?? []).map((method) => [method.user_id, method]))
  const charges: CheckoutCharge[] = []

  for (const total of totals) {
    const paymentMethod = paymentMethodByUser.get(total.userId)
    if (!paymentMethod) {
      charges.push({ userId: total.userId, amountCents: total.amountCents, status: 'failed', stripePaymentIntentId: null })
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
      result = { piId: null, status: 'failed' }
    }

    charges.push({
      userId: total.userId,
      amountCents: total.amountCents,
      status: result.status,
      stripePaymentIntentId: result.piId,
    })
  }

  const { error: insertError } = await supabase.from('charges').upsert(
    charges.map((charge) => ({
      purchase_id: purchaseId,
      user_id: charge.userId,
      amount_cents: charge.amountCents,
      stripe_payment_intent_id: charge.stripePaymentIntentId,
      status: charge.status,
    })),
    { onConflict: 'purchase_id,user_id,amount_cents' },
  )

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  if (charges.every((charge) => charge.status === 'succeeded')) {
    const { error: updateError } = await supabase.from('purchases').update({ status: 'charged' }).eq('id', purchaseId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ charges })
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

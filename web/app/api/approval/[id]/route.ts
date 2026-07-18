import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'
import { checkoutPurchase } from '@/lib/checkout'
import { runSplit, recomputeSubtotal } from '@/lib/split-run'

// P3.3 — F5 logic. Approve or decline a flagged line.
// Decline → delete the line (cascades its splits + this approval), recompute
// subtotal, re-split. Approve → if no approvals remain pending, purchase is
// checkout-ready (status back to 'building').
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { decision } = (await req.json()) as { decision: 'approved' | 'declined' }
  if (decision !== 'approved' && decision !== 'declined')
    return NextResponse.json({ error: 'decision must be approved|declined' }, { status: 400 })

  const db = admin()
  const { data: approval } = await db
    .from('approvals')
    .select('id, purchase_id, purchase_item_id')
    .eq('id', id)
    .single()
  if (!approval) return NextResponse.json({ error: 'approval not found' }, { status: 404 })

  if (decision === 'declined') {
    // Deleting the item cascades item_splits + this approval row.
    await db.from('purchase_items').delete().eq('id', approval.purchase_item_id)
    await recomputeSubtotal(approval.purchase_id)
    await runSplit(approval.purchase_id) // re-split without the declined line
    return NextResponse.json({ ok: true })
  }

  // Approving the final pending rule is the only path that can start checkout.
  // The checkout service re-checks the pending count before it calls Stripe.
  const { error: approvalError } = await db.from('approvals').update({ status: 'approved' }).eq('id', id)
  if (approvalError) return NextResponse.json({ error: approvalError.message }, { status: 500 })

  const { count, error: countError } = await db
    .from('approvals')
    .select('id', { count: 'exact', head: true })
    .eq('purchase_id', approval.purchase_id)
    .eq('status', 'pending')
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
  if (count) return NextResponse.json({ ok: true, awaitingOtherApprovals: true })

  const checkout = await checkoutPurchase(approval.purchase_id, db)
  return NextResponse.json(
    { ok: checkout.status === 200, ...checkout.body },
    { status: checkout.status },
  )
}

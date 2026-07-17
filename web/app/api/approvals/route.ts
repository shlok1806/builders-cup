import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'

// P3.3b — F5 support. Pending approvals for one approver. Backs the approval
// device's initial load AND the NEXT_PUBLIC_REALTIME=0 poll fallback — realtime
// only delivers events fired *after* a client subscribes, so an already-pending
// approval emits nothing when the phone connects.
export async function GET(req: Request) {
  const user = new URL(req.url).searchParams.get('user')
  if (!user) return NextResponse.json({ error: 'user required' }, { status: 400 })

  const db = admin()
  const { data } = await db
    .from('approvals')
    .select('id, purchase_id, purchase_item_id, approver_id, rule, purchase_items(name, unit_price_cents, qty)')
    .eq('approver_id', user)
    .eq('status', 'pending')

  const pending = (data ?? []).map((a) => {
    // supabase types the nested relation as object|array depending on cardinality
    const item = (Array.isArray(a.purchase_items) ? a.purchase_items[0] : a.purchase_items) as
      | { name: string; unit_price_cents: number; qty: number }
      | null
    return {
      id: a.id,
      purchaseId: a.purchase_id,
      purchaseItemId: a.purchase_item_id,
      approverId: a.approver_id,
      rule: a.rule,
      itemName: item?.name ?? '',
      amountCents: item ? item.unit_price_cents * item.qty : 0,
    }
  })
  return NextResponse.json({ pending })
}

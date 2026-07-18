import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'
import { savingsVsSecond } from '@/lib/deals'

// F8 — the closing proof. savedCents = what the agent saved by taking the cheapest
// offer over the runner-up on each line (the Ramp "we found you savings" number).
// stepsCollapsed is the fixed narrative integer: build -> split -> chase x N ->
// settle, all collapsed into one checkout.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = admin()

  const { data: items } = await db
    .from('purchase_items')
    .select('product_id, qty')
    .eq('purchase_id', id)

  let dealSavingsCents = 0
  const perUnit = new Map<string, number>()
  for (const it of (items ?? []) as { product_id: string | null; qty: number }[]) {
    if (!it.product_id) continue
    let s = perUnit.get(it.product_id)
    if (s === undefined) {
      s = await savingsVsSecond(it.product_id)
      perUnit.set(it.product_id, s)
    }
    dealSavingsCents += s * it.qty
  }

  return NextResponse.json({
    savedCents: dealSavingsCents,
    dealSavingsCents,
    stepsCollapsed: 4,
  })
}

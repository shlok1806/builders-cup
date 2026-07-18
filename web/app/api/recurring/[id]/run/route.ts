import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'
import { createBuildingPurchase, insertPurchaseItems } from '@/lib/agent-data'
import { runSplit } from '@/lib/split-run'

// POST { userId } — rebuild a saved cart into a fresh purchase and split it.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { userId?: string }
  const db = admin()
  const { data: cart } = await db
    .from('recurring_carts')
    .select('id, name, items')
    .eq('id', id)
    .single()
  if (!cart) return NextResponse.json({ error: 'recurring cart not found' }, { status: 404 })

  const purchaseId = await createBuildingPurchase({
    createdBy: body.userId ?? 'seed-user',
    note: JSON.stringify({ text: `Reorder: ${cart.name}`, skipped: [] }),
  })
  await db.from('purchases').update({ recurring_cart_id: id }).eq('id', purchaseId)
  await insertPurchaseItems(purchaseId, cart.items as { product_id: string; qty: number }[])
  const lines = await runSplit(purchaseId)
  return NextResponse.json({ purchaseId, lines })
}

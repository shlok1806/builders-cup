import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'

// The running cart is a purchase; these read/mutate its lines for the /checkout
// page. GET lists items + subtotal; DELETE ?item=<id> removes one line and
// re-reconciles the stored subtotal.
type Row = {
  id: string
  name: string
  qty: number
  unit_price_cents: number
  category: string
  products: { name: string } | null
  offers: { url: string | null } | null
}
type Item = {
  id: string
  name: string
  productName: string
  url: string | null
  qty: number
  unit_price_cents: number
  category: string
}

async function loadCart(db: ReturnType<typeof admin>, id: string) {
  // Embed the canonical product name and the sourced offer's URL so /checkout can
  // show the real item + a link out, matching the add-to-cart screen.
  const { data, error } = await db
    .from('purchase_items')
    .select('id, name, qty, unit_price_cents, category, products(name), offers(url)')
    .eq('purchase_id', id)
    .order('name', { ascending: true })
  if (error) throw error
  const items: Item[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    productName: r.products?.name ?? r.name,
    url: r.offers?.url ?? null,
    qty: r.qty,
    unit_price_cents: r.unit_price_cents,
    category: r.category,
  }))
  const subtotalCents = items.reduce((s, i) => s + i.unit_price_cents * i.qty, 0)
  return { items, subtotalCents }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    return NextResponse.json(await loadCart(admin(), id))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const itemId = new URL(req.url).searchParams.get('item')
  if (!itemId) return NextResponse.json({ error: 'item required' }, { status: 400 })
  const db = admin()
  try {
    const { error } = await db.from('purchase_items').delete().eq('id', itemId).eq('purchase_id', id)
    if (error) throw error
    const cart = await loadCart(db, id)
    await db.from('purchases').update({ subtotal_cents: cart.subtotalCents }).eq('id', id)
    return NextResponse.json(cart)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

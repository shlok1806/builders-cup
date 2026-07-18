import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'

// The household's SHARED running cart = its open `building` purchase. Every member
// resolves the same cart from here, so adds/removes by anyone are visible to all
// (auto-restock drafts don't collide — they flip to awaiting_approval immediately).
// ponytail: most-recent building purchase per household; add a marker column if a
// second concurrent building cart ever becomes possible.
export async function GET() {
  const db = admin()
  const { data: hh } = await db.from('households').select('id').limit(1).single()
  if (!hh) return NextResponse.json({ cartId: null, count: 0, subtotalCents: 0 })

  const { data: open } = await db
    .from('purchases')
    .select('id')
    .eq('household_id', hh.id)
    .eq('status', 'building')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!open) return NextResponse.json({ cartId: null, count: 0, subtotalCents: 0 })

  const { data: items } = await db
    .from('purchase_items')
    .select('unit_price_cents, qty')
    .eq('purchase_id', open.id)
  const rows = (items ?? []) as { unit_price_cents: number; qty: number }[]

  return NextResponse.json({
    cartId: open.id as string,
    count: rows.length,
    subtotalCents: rows.reduce((s, r) => s + r.unit_price_cents * r.qty, 0),
  })
}

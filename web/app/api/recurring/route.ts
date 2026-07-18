import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'

// GET ?user=<id> — recurring carts for the household + this user's standing verdict on each.
export async function GET(req: Request) {
  const user = new URL(req.url).searchParams.get('user')
  if (!user) return NextResponse.json({ error: 'user required' }, { status: 400 })
  const db = admin()
  const { data: carts, error } = await db
    .from('recurring_carts')
    .select('id, name, items')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: decisions } = await db
    .from('recurring_cart_approvals')
    .select('recurring_cart_id, decision')
    .eq('approver_id', user)
  const byId = new Map((decisions ?? []).map((d) => [d.recurring_cart_id, d.decision]))
  return NextResponse.json({
    carts: (carts ?? []).map((c) => ({ ...c, decision: byId.get(c.id) ?? 'ask' })),
  })
}

// POST { name, items:[{product_id,qty}], ownerId } -> { id }
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { name?: string; items?: unknown; ownerId?: string }
    | null
  if (!body?.name || !Array.isArray(body.items))
    return NextResponse.json({ error: 'name and items required' }, { status: 400 })
  // Each item must be {product_id, qty} — otherwise `run` silently produces an
  // empty cart (every product_id lookup misses) with no error surfaced.
  const validItems = body.items.every(
    (it): it is { product_id: string; qty: number } =>
      !!it && typeof (it as { product_id?: unknown }).product_id === 'string' &&
      Number.isInteger((it as { qty?: unknown }).qty) && (it as { qty: number }).qty > 0,
  )
  if (!validItems)
    return NextResponse.json({ error: 'each item needs a string product_id and a positive integer qty' }, { status: 400 })
  const db = admin()
  const { data: hh } = await db.from('households').select('id').limit(1).single()
  const { data, error } = await db
    .from('recurring_carts')
    .insert({
      name: body.name,
      items: body.items,
      owner_id: body.ownerId ?? null,
      household_id: hh?.id ?? null,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}

import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'

// Past expenses for the household — backs the History tab. Newest first, with
// each purchase's line items and the per-user split breakdown. Read-only.
export async function GET() {
  const db = admin()

  const { data: household } = await db.from('households').select('id').limit(1).single()
  if (!household) return NextResponse.json({ error: 'no household' }, { status: 404 })

  const { data, error } = await db
    .from('purchases')
    .select(
      'id, created_at, status, subtotal_cents, note, purchase_items(name, qty, unit_price_cents, category, item_splits(amount_cents, user_id, users(name)))'
    )
    .eq('household_id', household.id)
    .eq('status', 'charged')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

  const purchases = (data ?? []).map((p) => {
    const items = (p.purchase_items ?? []) as {
      name: string
      qty: number
      unit_price_cents: number
      category: string
      item_splits: { amount_cents: number; user_id: string; users: { name: string } | { name: string }[] | null }[]
    }[]

    // per-user total across every line of this purchase
    const byUser = new Map<string, { name: string; cents: number }>()
    for (const it of items) {
      for (const s of it.item_splits ?? []) {
        const name = one(s.users)?.name ?? ''
        const u = byUser.get(s.user_id) ?? { name, cents: 0 }
        u.cents += s.amount_cents
        byUser.set(s.user_id, u)
      }
    }

    // note is JSON {text, skipped} for agent carts; fall back to raw string
    let title = ''
    try {
      title = p.note ? (JSON.parse(p.note).text ?? '') : ''
    } catch {
      title = p.note ?? ''
    }

    return {
      id: p.id,
      createdAt: p.created_at,
      status: p.status,
      subtotalCents: p.subtotal_cents,
      title,
      items: items.map((it) => ({
        name: it.name,
        qty: it.qty,
        category: it.category,
        unitPriceCents: it.unit_price_cents,
      })),
      byUser: [...byUser.entries()].map(([userId, v]) => ({ userId, name: v.name, cents: v.cents })),
    }
  })

  return NextResponse.json({ purchases })
}

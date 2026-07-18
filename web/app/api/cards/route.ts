import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'

// Household "cards" — one per member: their real card last-4/brand + this-month
// spend broken down by category (what they actually pay post-split). Same source
// as /api/dashboard (charged item_splits this month), regrouped per user×category.
export async function GET() {
  const db = admin()

  const { data: household } = await db
    .from('households')
    .select('id')
    .limit(1)
    .single()
  if (!household) return NextResponse.json({ error: 'no household' }, { status: 404 })

  const [{ data: users }, { data: pms }, { data: splits }] = await Promise.all([
    db.from('users').select('id, name, color').eq('household_id', household.id),
    db.from('payment_methods').select('user_id, last4, brand'),
    (() => {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      return db
        .from('item_splits')
        .select('amount_cents, user_id, purchase_items!inner(category, purchases!inner(household_id, status, created_at))')
        .eq('purchase_items.purchases.household_id', household.id)
        .eq('purchase_items.purchases.status', 'charged')
        .gte('purchase_items.purchases.created_at', monthStart)
    })(),
  ])

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
  type Row = { amount_cents: number; user_id: string; purchase_items: unknown }

  // Per user: total + category map.
  const agg = new Map<string, { spentCents: number; byCat: Map<string, number> }>()
  for (const r of (splits ?? []) as Row[]) {
    const pi = one(r.purchase_items) as { category: string } | null
    const cat = pi?.category ?? 'other'
    const u = agg.get(r.user_id) ?? { spentCents: 0, byCat: new Map() }
    u.spentCents += r.amount_cents
    u.byCat.set(cat, (u.byCat.get(cat) ?? 0) + r.amount_cents)
    agg.set(r.user_id, u)
  }

  const pmByUser = new Map((pms ?? []).map((p) => [p.user_id, p]))

  const cards = (users ?? [])
    .map((u) => {
      const a = agg.get(u.id)
      const pm = pmByUser.get(u.id)
      return {
        userId: u.id,
        name: u.name as string,
        color: (u.color as string) ?? 'accent',
        last4: pm?.last4 ?? '0000',
        brand: pm?.brand ?? 'card',
        spentCents: a?.spentCents ?? 0,
        byCategory: [...(a?.byCat ?? new Map()).entries()]
          .map(([category, cents]) => ({ category, cents: cents as number }))
          .sort((x, y) => y.cents - x.cents),
      }
    })
    .sort((x, y) => y.spentCents - x.spentCents)

  return NextResponse.json({ cards })
}

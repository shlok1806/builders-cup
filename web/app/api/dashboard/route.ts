import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'

// P3.4 — F7. This-month spend aggregated by category + by user, vs budget.
// Filter on purchases.created_at (the order date) — NOT item_splits.created_at,
// which is stamped today at split time and would hide backdated prior purchases.
export async function GET() {
  const db = admin()

  const { data: household } = await db
    .from('households')
    .select('id, monthly_budget_cents')
    .limit(1)
    .single()
  if (!household) return NextResponse.json({ error: 'no household' }, { status: 404 })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { data } = await db
    .from('item_splits')
    .select(
      'amount_cents, user_id, users(name), purchase_items!inner(category, purchases!inner(created_at, household_id, status))'
    )
    .eq('purchase_items.purchases.household_id', household.id)
    .gte('purchase_items.purchases.created_at', monthStart)

  type Row = {
    amount_cents: number
    user_id: string
    users: { name: string } | { name: string }[] | null
    purchase_items: { category: string; purchases: { status: string } | { status: string }[] }
      | { category: string; purchases: { status: string } | { status: string }[] }[]
  }
  const rows = (data ?? []) as unknown as Row[]
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

  let thisMonthCents = 0
  let owedCents = 0 // splits on purchases not yet charged (settled)
  const byCat = new Map<string, number>()
  const byUser = new Map<string, { name: string; cents: number }>()
  const pendingUsers = new Set<string>() // owe money on an uncharged purchase
  for (const r of rows) {
    thisMonthCents += r.amount_cents
    const pi = one(r.purchase_items)
    const settled = one(pi?.purchases ?? null)?.status === 'charged'
    if (!settled) { owedCents += r.amount_cents; pendingUsers.add(r.user_id) }
    const cat = pi?.category ?? 'other'
    byCat.set(cat, (byCat.get(cat) ?? 0) + r.amount_cents)
    const name = one(r.users)?.name ?? ''
    const u = byUser.get(r.user_id) ?? { name, cents: 0 }
    u.cents += r.amount_cents
    byUser.set(r.user_id, u)
  }

  return NextResponse.json({
    thisMonthCents,
    byCategory: [...byCat.entries()]
      .map(([category, cents]) => ({ category, cents }))
      .sort((a, b) => b.cents - a.cents),
    byUser: [...byUser.entries()].map(([userId, v]) => ({
      userId,
      name: v.name,
      cents: v.cents,
    })),
    budgetCents: household.monthly_budget_cents,
    overBudget: thisMonthCents > household.monthly_budget_cents,
    owedCents,
    chargedUsers: byUser.size - pendingUsers.size,
    totalUsers: byUser.size,
  })
}

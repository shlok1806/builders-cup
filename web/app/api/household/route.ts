import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'

// PATCH { monthlyBudgetCents } — update the (single demo) household's budget.
export async function PATCH(req: Request) {
  let body: { monthlyBudgetCents?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }) }

  const cents = body.monthlyBudgetCents
  if (typeof cents !== 'number' || !Number.isInteger(cents) || cents < 0)
    return NextResponse.json({ error: 'monthlyBudgetCents must be a non-negative integer' }, { status: 400 })

  const db = admin()
  const { data: hh } = await db.from('households').select('id').limit(1).single()
  if (!hh) return NextResponse.json({ error: 'no household' }, { status: 404 })

  const { error } = await db.from('households').update({ monthly_budget_cents: cents }).eq('id', hh.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, monthlyBudgetCents: cents })
}

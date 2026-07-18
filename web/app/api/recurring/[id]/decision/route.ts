import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'

// POST { approverId, decision: 'always'|'ask'|'never' }.
// 'ask' clears the row (absence = ask); 'always'|'never' upsert it.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => null)) as
    | { approverId?: string; decision?: string }
    | null
  if (!body?.approverId || !['always', 'ask', 'never'].includes(body.decision ?? ''))
    return NextResponse.json(
      { error: 'approverId and decision(always|ask|never) required' },
      { status: 400 },
    )
  const db = admin()
  if (body.decision === 'ask') {
    await db
      .from('recurring_cart_approvals')
      .delete()
      .eq('recurring_cart_id', id)
      .eq('approver_id', body.approverId)
    return NextResponse.json({ ok: true, decision: 'ask' })
  }
  const { error } = await db.from('recurring_cart_approvals').upsert(
    {
      recurring_cart_id: id,
      approver_id: body.approverId,
      decision: body.decision,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'recurring_cart_id,approver_id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, decision: body.decision })
}

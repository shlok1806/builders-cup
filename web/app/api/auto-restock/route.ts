import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'
import { runAutoRestock } from '@/lib/auto-restock'

// The weekly restock trigger — hit by a cron routine or the demo's "Run weekly
// restock" button. Drafts the cart, splits it, and leaves it at awaiting_approval.
// It NEVER charges: checkout is a separate, human-initiated step.
export async function POST(req: Request) {
  const db = admin()
  try {
    let householdId: string | undefined
    try {
      householdId = ((await req.json()) as { householdId?: string }).householdId
    } catch {
      householdId = undefined
    }
    if (!householdId) {
      const { data: hh } = await db.from('households').select('id').limit(1).single()
      if (!hh) return NextResponse.json({ error: 'no household' }, { status: 404 })
      householdId = hh.id as string
    }
    const result = await runAutoRestock(householdId!)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

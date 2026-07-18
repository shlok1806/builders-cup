import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'

// Roster of the (single) household's real users — the source of truth for "who
// am I" now that the frontend switched off the mock lib/data.people ids.
export async function GET() {
  const db = admin()

  const { data: household } = await db.from('households').select('id').limit(1).single()
  if (!household) return NextResponse.json({ error: 'no household' }, { status: 404 })

  const { data, error } = await db
    .from('users')
    .select('id, name, color')
    .eq('household_id', household.id)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ users: data ?? [] })
}

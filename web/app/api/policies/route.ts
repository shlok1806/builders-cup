import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'

// A user's compiled rules — backs the settings page list. Newest first.
export async function GET(req: Request) {
  const user = new URL(req.url).searchParams.get('user')
  if (!user) return NextResponse.json({ error: 'user required' }, { status: 400 })

  const db = admin()
  const { data, error } = await db
    .from('policies')
    .select('id, type, params, source_text')
    .eq('user_id', user)
    .order('id', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ policies: data ?? [] })
}

import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'

// Delete one of a user's rules. Scoped by user_id so a request can only remove
// its own policy. Existing splits aren't re-run here — re-splitting a cart
// re-reads policies, so the deletion takes effect on the next split.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = new URL(req.url).searchParams.get('user')
  if (!user) return NextResponse.json({ error: 'user required' }, { status: 400 })

  const db = admin()
  const { error } = await db.from('policies').delete().eq('id', id).eq('user_id', user)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

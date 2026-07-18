import { NextResponse } from 'next/server'
import { runSplit } from '@/lib/split-run'

// P3.2 — F4. Runs the deterministic split for a purchase, writing item_splits +
// pending approvals, and returns the split view.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const lines = await runSplit(id)
    return NextResponse.json({ lines })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'
import { DEFAULT_ALLOWLIST } from '@/lib/scrape/allowlist'
import { getHouseholdAllowlist, setHouseholdAllowlist } from '@/lib/allowlist-store'

// The household's trusted-store allowlist — backs the Settings "Trusted stores"
// section. No auth in the demo: default to the seeded household.
async function resolveHousehold(req: Request): Promise<string | null> {
  const q = new URL(req.url).searchParams.get('household')
  if (q) return q
  const { data } = await admin().from('households').select('id').limit(1).single()
  return (data?.id as string) ?? null
}

export async function GET(req: Request) {
  const hhId = await resolveHousehold(req)
  if (!hhId) return NextResponse.json({ error: 'no household' }, { status: 404 })
  // allowed = null → household hasn't narrowed the list (every default store is on).
  const allowed = await getHouseholdAllowlist(hhId)
  return NextResponse.json({ householdId: hhId, allowed, defaults: DEFAULT_ALLOWLIST })
}

export async function PUT(req: Request) {
  const hhId = await resolveHousehold(req)
  if (!hhId) return NextResponse.json({ error: 'no household' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as { vendors?: string[] | null }
  const vendors = body.vendors
  if (vendors !== null && !Array.isArray(vendors)) {
    return NextResponse.json({ error: 'vendors must be an array or null' }, { status: 400 })
  }
  // Normalize: trim, drop blanks, dedupe. null clears the override (→ default set).
  const clean =
    vendors === null
      ? null
      : Array.from(new Set(vendors.map((v) => v.trim()).filter(Boolean)))

  const res = await setHouseholdAllowlist(hhId, clean)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json({ ok: true, allowed: clean })
}

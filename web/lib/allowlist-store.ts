import { admin } from './supabase'

// Reads/writes households.allowed_vendors (the trusted-store allowlist).
// Deliberately resilient to the column not existing yet (pre-migration): a failed
// select is treated as "not configured" → null → callers fall back to
// DEFAULT_ALLOWLIST. Kept out of the budget select in compose so a missing column
// can never break the money path — it only ever softens the allowlist to default.
export async function getHouseholdAllowlist(householdId: string): Promise<string[] | null> {
  const db = admin()
  const { data, error } = await db
    .from('households')
    .select('allowed_vendors')
    .eq('id', householdId)
    .single()
  if (error) return null // column absent pre-migration, or no row → use default
  return (data?.allowed_vendors as string[] | null) ?? null
}

// null clears the override (→ back to the default set). Returns the DB error text
// (e.g. missing column before the migration is applied) so the UI can surface it.
export async function setHouseholdAllowlist(
  householdId: string,
  vendors: string[] | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = admin()
  const { error } = await db.from('households').update({ allowed_vendors: vendors }).eq('id', householdId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

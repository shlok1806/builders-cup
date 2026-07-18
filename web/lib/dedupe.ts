import type { SupabaseClient } from '@supabase/supabase-js'
import type { RawOffer } from './scrape/types'

// Cross-vendor dedupe: map many vendor listings of the same real item to one
// canonical `products` row via canonical_key. Deterministic string normalization
// (demo-safe, off the money path). LLM-assisted canonicalization can slot in here
// later behind the same signature.

const STOP = new Set([
  'the', 'a', 'an', 'of', 'with', 'for', 'and', 'plus',
  'pack', 'count', 'ct', 'value', 'size', 'each', 'new',
])

// Order-independent token key so "Bounty Paper Towels 12ct" and
// "Paper Towels, Bounty 12 count" collapse together. Numbers are kept so
// different sizes stay distinct.
export function canonicalKey(title: string, unit?: string | null): string {
  const tokens = `${title} ${unit ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOP.has(t))
  return Array.from(new Set(tokens)).sort().join(' ')
}

// Returns the canonical product_id for a raw offer, creating the product if new.
// products.category / price_cents are NOT NULL, so we supply a category (from the
// need being resolved) and a reference price (first offer seen; real pricing lives
// in `offers`).
export async function canonicalize(
  db: SupabaseClient,
  raw: RawOffer,
  opts: { category?: string } = {}
): Promise<string> {
  const key = canonicalKey(raw.title, raw.unit)

  const { data: existing } = await db
    .from('products')
    .select('id')
    .eq('canonical_key', key)
    .maybeSingle()
  if (existing) return existing.id as string

  const { data: created, error } = await db
    .from('products')
    .insert({
      name: raw.title,
      category: opts.category ?? 'uncategorized',
      canonical_key: key,
      price_cents: raw.priceCents,
      unit: raw.unit ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return created!.id as string
}

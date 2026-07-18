import { admin } from './supabase'
import { getOffers } from './scrape'
import { composeCart, type ComposeCandidate, type Skipped } from './openai'
import type { OfferRow } from './types'

// The shared cart composer both procurement paths run through:
//   • /api/cart/build  — free-text request ∪ what's predicted to run low
//   • auto-restock     — purely what's predicted to run low
// It sources the cheapest real offer for every candidate, hands those facts +
// the remaining budget to the LLM composer (composeCart), then prices the chosen
// lines deterministically. The LLM decides WHAT/HOW MANY; code owns every number.

export type Seed = { name: string; category: string }

// Where an offer's price actually came from, inferred from the row's `raw`:
//   synthetic → made-up fallback (raw.synthetic), fixture → cached demo data
//   (no raw), live → a real scraped listing (serpapi's result object).
// Use this to tell a real price from a fallback in logs and (later) the UI.
export function offerSource(o: OfferRow): 'live' | 'fixture' | 'synthetic' {
  const raw = o.raw as { synthetic?: boolean } | null
  if (raw && typeof raw === 'object' && raw.synthetic) return 'synthetic'
  if (raw == null) return 'fixture'
  return 'live'
}

export type PlanLine = {
  name: string
  category: string
  qty: number
  reason: string | null
  best: OfferRow // the sourced offer this line is priced against
  offersCount: number // in-stock offers compared for this need
  runnerUpCents: number | null // next-cheapest vendor (for "was" strikethrough)
}

export type CartPlan = {
  lines: PlanLine[]
  skipped: Skipped[]
  subtotalCents: number
  dealsCompared: number // total offers compared across all needs
  budgetRemainingCents: number
  overBudget: boolean
}

// Month-to-date spend for the household (item_splits under this month's purchases).
// Lives here because both the composer's budget headroom and the auto-restock
// budget gate read it.
export async function monthSpendCents(
  db: ReturnType<typeof admin>,
  householdId: string
): Promise<number> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { data } = await db
    .from('item_splits')
    .select('amount_cents, purchase_items!inner(purchases!inner(household_id, created_at))')
    .eq('purchase_items.purchases.household_id', householdId)
    .eq('purchase_items.purchases.status', 'charged')
    .gte('purchase_items.purchases.created_at', monthStart)
  return ((data ?? []) as { amount_cents: number }[]).reduce((s, r) => s + r.amount_cents, 0)
}

export async function planCart(opts: {
  householdId: string
  seeds: Seed[]
  request?: string
  dueNames?: Set<string> // lowercased names predicted to run out soon
  recentNames?: string[] // names bought recently (skip re-buying)
}): Promise<CartPlan> {
  const db = admin()

  // Budget headroom: remaining = monthly budget − month-to-date spend. 0 = no cap.
  const { data: hh } = await db
    .from('households')
    .select('monthly_budget_cents')
    .eq('id', opts.householdId)
    .single()
  const budgetCents = hh?.monthly_budget_cents ?? 0
  const spent = await monthSpendCents(db, opts.householdId)
  const budgetRemainingCents = budgetCents > 0 ? Math.max(0, budgetCents - spent) : 0

  const dueNames = opts.dueNames ?? new Set<string>()
  const recentSet = new Set((opts.recentNames ?? []).map((n) => n.toLowerCase()))

  // Dedupe seeds by name — the request and the due list often overlap.
  const seenSeed = new Set<string>()
  const seeds = opts.seeds.filter((s) => {
    const k = s.name.toLowerCase()
    if (seenSeed.has(k)) return false
    seenSeed.add(k)
    return true
  })

  // Source the cheapest in-stock offer for every seed (runs the scraper's 3-tier
  // fallback, so every seed prices out even offline).
  type Sourced = { seed: Seed; best: OfferRow | null; offersCount: number; runnerUpCents: number | null; savingsCents: number }
  const sourced: Sourced[] = []
  let dealsCompared = 0
  for (const seed of seeds) {
    const offers = await getOffers(seed.name, { category: seed.category })
    dealsCompared += offers.length
    const inStock = offers.filter((o) => o.in_stock).sort((a, b) => a.price_cents - b.price_cents)
    const best = inStock[0] ?? null
    const runnerUpCents = inStock[1]?.price_cents ?? null
    sourced.push({
      seed,
      best,
      offersCount: inStock.length,
      runnerUpCents,
      savingsCents: best && runnerUpCents != null ? runnerUpCents - best.price_cents : 0,
    })
  }

  // Only seeds we actually found an offer for are candidates the composer can pick.
  const candidates: ComposeCandidate[] = sourced
    .filter((s) => s.best)
    .map((s) => ({
      name: s.seed.name,
      category: s.seed.category,
      unitPriceCents: s.best!.price_cents,
      savingsCents: s.savingsCents,
      offersCount: s.offersCount,
      dueSoon: dueNames.has(s.seed.name.toLowerCase()),
      boughtRecently: recentSet.has(s.seed.name.toLowerCase()),
    }))

  const decision = await composeCart({ request: opts.request, budgetRemainingCents, candidates })

  // Price each chosen line against the offer we already sourced for it.
  const byName = new Map(sourced.map((s) => [s.seed.name.toLowerCase(), s]))
  const lines: PlanLine[] = []
  let subtotal = 0
  for (const it of decision.items) {
    const s = byName.get(it.name.toLowerCase())
    if (!s || !s.best) continue
    lines.push({
      name: s.seed.name,
      category: s.seed.category,
      qty: it.qty,
      reason: it.reason,
      best: s.best,
      offersCount: s.offersCount,
      runnerUpCents: s.runnerUpCents,
    })
    subtotal += s.best.price_cents * it.qty
  }

  // Fold in seeds that had no offer at all as skips (composer never saw them).
  const skipped = [...decision.skipped]
  const noted = new Set(skipped.map((k) => k.name.toLowerCase()))
  for (const s of sourced) {
    if (!s.best && !noted.has(s.seed.name.toLowerCase())) {
      skipped.push({ name: s.seed.name, reason: 'no offers found' })
    }
  }

  const overBudget = budgetCents > 0 && subtotal > budgetRemainingCents

  // Human-readable summary of what the composer actually did — each kept line
  // tagged with its price provenance (LIVE / fixture / SYNTHETIC), and every skip
  // with its reason. This is where a suspicious price (e.g. a $24 synthetic Windex)
  // shows up as SYNTHETIC rather than a real listing.
  const budgetStr = budgetRemainingCents > 0 ? `$${(budgetRemainingCents / 100).toFixed(2)}` : 'none'
  console.log(
    `[compose] ${opts.request ? `request="${opts.request}"` : 'auto-restock'} · ` +
      `budget left ${budgetStr} · ${lines.length} kept / ${skipped.length} skipped` +
      (overBudget ? ' · OVER BUDGET' : '')
  )
  for (const l of lines) {
    const src = offerSource(l.best)
    const flag = src === 'synthetic' ? 'SYNTHETIC' : src === 'fixture' ? 'fixture' : 'live'
    console.log(
      `[compose]   ✓ ${l.qty}× ${l.name} — ${l.best.vendor} $${(l.best.price_cents / 100).toFixed(2)} ` +
        `[${flag}, cheapest of ${l.offersCount}]${l.reason ? ` (${l.reason})` : ''}`
    )
  }
  for (const s of skipped) console.log(`[compose]   ✗ ${s.name} — ${s.reason}`)

  return { lines, skipped, subtotalCents: subtotal, dealsCompared, budgetRemainingCents, overBudget }
}

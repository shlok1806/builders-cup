import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'
import { buildCart, categorize } from '@/lib/openai'
import { getOffers } from '@/lib/scrape'
import { pickBest } from '@/lib/deals'

// F2 — the cart builder. Two entry shapes, same pricing path:
//  - itemized: { items: [{name, qty}] } — the user typed rows; we infer category.
//  - free text: { text } — buildCart() (LLM) turns it into needs.
// Deterministic code resolves each need to the cheapest real offer across vendors
// and writes priced purchase_items. The LLM never sees a price.
export async function POST(req: Request) {
  const db = admin()
  try {
    const { text, items: rawItems, householdId, createdBy } = (await req.json()) as {
      text?: string
      items?: { name?: string; qty?: number; unit?: string }[]
      householdId?: string
      createdBy?: string
    }

    // Build the need list: itemized rows take priority over free text.
    // `name` is the search query (matches offer fixtures); `unit` is the typed
    // measurement (e.g. "12 oz") — display only, never part of the search.
    let needs: { name: string; unit: string | null; category: string; qty: number }[]
    let skipped: { name: string; reason: string }[]
    let note: string
    if (Array.isArray(rawItems) && rawItems.length) {
      needs = rawItems
        .filter((i) => i.name?.trim())
        .map((i) => ({
          name: i.name!.trim(),
          unit: i.unit?.trim() || null,
          qty: Math.max(1, Math.floor(Number(i.qty) || 1)),
          category: categorize(i.name!),
        }))
      if (!needs.length) return NextResponse.json({ error: 'items required' }, { status: 400 })
      skipped = []
      note = needs.map((n) => `${n.qty}× ${n.name}${n.unit ? ` ${n.unit}` : ''}`).join(', ')
    } else if (text) {
      const cart = await buildCart(text)
      needs = cart.items.map((n) => ({ ...n, unit: null }))
      skipped = [...cart.skipped]
      note = text
    } else {
      return NextResponse.json({ error: 'text or items required' }, { status: 400 })
    }

    // Resolve household (no auth — default to the seeded one).
    let hhId = householdId
    if (!hhId) {
      const { data: hh } = await db.from('households').select('id').limit(1).single()
      if (!hh) return NextResponse.json({ error: 'no household' }, { status: 404 })
      hhId = hh.id
    }
    let userId = createdBy
    if (!userId) {
      const { data: u } = await db.from('users').select('id').eq('household_id', hhId).limit(1).single()
      userId = u?.id
    }

    const { data: purchase, error: pErr } = await db
      .from('purchases')
      .insert({ household_id: hhId, status: 'building', subtotal_cents: 0, note, created_by: userId })
      .select('id')
      .single()
    if (pErr) throw pErr
    const purchaseId = purchase!.id as string

    const items: {
      id: string
      name: string
      query: string
      unit: string | null
      qty: number
      category: string
      unit_price_cents: number
      vendor: string
      url: string | null
      offersCount: number
      runnerUpCents: number | null
    }[] = []
    let subtotal = 0
    let dealsCompared = 0

    for (const need of needs) {
      // Store/display the measurement folded in; search on the base name only so
      // "Tortilla Chips" still resolves whether or not a unit was typed.
      const displayName = need.unit ? `${need.name} ${need.unit}` : need.name
      const offers = await getOffers(need.name, { category: need.category })
      dealsCompared += offers.length
      const best = pickBest(offers)
      if (!best) {
        skipped.push({ name: need.name, reason: 'no offers found' })
        continue
      }
      const inStock = offers.filter((o) => o.in_stock).sort((a, b) => a.price_cents - b.price_cents)
      const runnerUpCents = inStock[1]?.price_cents ?? null
      const { data: line, error: iErr } = await db
        .from('purchase_items')
        .insert({
          purchase_id: purchaseId,
          product_id: best.product_id,
          name: displayName,
          qty: need.qty,
          unit_price_cents: best.price_cents,
          category: need.category,
          offer_id: best.id,
        })
        .select('id')
        .single()
      if (iErr) throw iErr
      subtotal += best.price_cents * need.qty
      items.push({
        id: line!.id as string,
        name: displayName,
        query: need.name,
        unit: need.unit,
        qty: need.qty,
        category: need.category,
        unit_price_cents: best.price_cents,
        vendor: best.vendor,
        url: best.url,
        offersCount: inStock.length,
        runnerUpCents,
      })
    }

    await db.from('purchases').update({ subtotal_cents: subtotal }).eq('id', purchaseId)

    return NextResponse.json({ purchaseId, items, skipped, dealsCompared })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

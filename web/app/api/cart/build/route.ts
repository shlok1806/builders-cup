import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'
import { buildCart } from '@/lib/openai'
import { getOffers } from '@/lib/scrape'
import { pickBest } from '@/lib/deals'

// F2 — the agentic cart builder, now web-sourced. buildCart() (LLM) turns free
// text into needs; deterministic code resolves each need to the cheapest real
// offer across vendors and writes priced purchase_items. The LLM never sees a
// price.
export async function POST(req: Request) {
  const db = admin()
  try {
    const { text, householdId, createdBy } = (await req.json()) as {
      text?: string
      householdId?: string
      createdBy?: string
    }
    if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

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

    const cart = await buildCart(text)

    const { data: purchase, error: pErr } = await db
      .from('purchases')
      .insert({ household_id: hhId, status: 'building', subtotal_cents: 0, note: text, created_by: userId })
      .select('id')
      .single()
    if (pErr) throw pErr
    const purchaseId = purchase!.id as string

    const items: {
      id: string
      name: string
      qty: number
      category: string
      unit_price_cents: number
      vendor: string
      url: string | null
      offersCount: number
      runnerUpCents: number | null
    }[] = []
    const skipped = [...cart.skipped]
    let subtotal = 0
    let dealsCompared = 0

    for (const need of cart.items) {
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
          name: need.name,
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
        name: need.name,
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

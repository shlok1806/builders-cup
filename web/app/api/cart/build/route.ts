import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'
import { buildCart } from '@/lib/openai'
import { dueItems } from '@/lib/restock'
import { planCart, type Seed } from '@/lib/compose'

// F2 — the agentic cart builder. buildCart() (LLM) turns the free-text request
// into needs; those union with what the restock predictor says is running low,
// and planCart() sources the cheapest real offer for each and composes the final
// cart — what to include, quantities, and what to trim to the monthly budget. The
// LLM never sees a vendor price and never writes a number.
export async function POST(req: Request) {
  const db = admin()
  try {
    const { text, householdId, createdBy } = (await req.json()) as {
      text?: string
      householdId?: string
      createdBy?: string
    }
    if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 })

    // Resolve household (no auth — default to the seeded one).
    let hhId: string | undefined = householdId
    if (!hhId) {
      const { data: hh } = await db.from('households').select('id').limit(1).single()
      if (!hh) return NextResponse.json({ error: 'no household' }, { status: 404 })
      hhId = hh.id as string
    }
    let userId = createdBy
    if (!userId) {
      const { data: u } = await db.from('users').select('id').eq('household_id', hhId).limit(1).single()
      userId = u?.id
    }

    // Parse the request, union with the restock predictor's due staples, and let
    // the composer source + compose the final cart. No recency skip (removed).
    const cart = await buildCart(text, [])
    const due = await dueItems(hhId)
    const seeds: Seed[] = [
      ...cart.items.map((i) => ({ name: i.name, category: i.category as string })),
      ...due.map((d) => ({ name: d.name, category: d.category })),
    ]
    const dueNames = new Set(due.map((d) => d.name.toLowerCase()))

    const plan = await planCart({ householdId: hhId, request: text, seeds, dueNames })

    const { data: purchase, error: pErr } = await db
      .from('purchases')
      .insert({ household_id: hhId, status: 'building', subtotal_cents: plan.subtotalCents, note: text, created_by: userId })
      .select('id')
      .single()
    if (pErr) throw pErr
    const purchaseId = purchase!.id as string

    // Resolve each line's canonical product name (e.g. "Starbucks Pike Place
    // Ground Coffee 28 oz") so the cart shows the actual item sourced, not the
    // generic request term ("coffee"). Falls back to the seed name if missing.
    const productIds = [...new Set(plan.lines.map((l) => l.best.product_id))]
    const { data: prods } = productIds.length
      ? await db.from('products').select('id, name').in('id', productIds)
      : { data: [] as { id: string; name: string }[] }
    const nameById = new Map((prods ?? []).map((p) => [p.id as string, p.name as string]))

    const items: {
      id: string
      name: string
      productName: string
      qty: number
      category: string
      unit_price_cents: number
      vendor: string
      url: string | null
      offersCount: number
      runnerUpCents: number | null
      reason: string | null
    }[] = []

    for (const line of plan.lines) {
      const { data: row, error: iErr } = await db
        .from('purchase_items')
        .insert({
          purchase_id: purchaseId,
          product_id: line.best.product_id,
          name: line.name,
          qty: line.qty,
          unit_price_cents: line.best.price_cents,
          category: line.category,
          offer_id: line.best.id,
        })
        .select('id')
        .single()
      if (iErr) throw iErr
      items.push({
        id: row!.id as string,
        name: line.name,
        productName: nameById.get(line.best.product_id) ?? line.name,
        qty: line.qty,
        category: line.category,
        unit_price_cents: line.best.price_cents,
        vendor: line.best.vendor,
        url: line.best.url,
        offersCount: line.offersCount,
        runnerUpCents: line.runnerUpCents,
        reason: line.reason,
      })
    }

    return NextResponse.json({
      purchaseId,
      items,
      skipped: [...cart.skipped, ...plan.skipped],
      dealsCompared: plan.dealsCompared,
      overBudget: plan.overBudget,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'
import { buildCart } from '@/lib/openai'
import { dueItems } from '@/lib/restock'
import { planCart, type Seed } from '@/lib/compose'

// F2 — the agentic cart builder, now web-sourced AND composed. buildCart() (LLM)
// turns free text into needs; those are unioned with what the restock predictor
// says is running low, and the shared composer (planCart) sources the cheapest
// real offer for each, then lets the LLM compose the final cart — deciding what to
// include, quantities, and what to trim to the monthly budget. The LLM never sees
// a vendor price it didn't get handed, and never writes a number. Recency: names
// bought in the last 14 days are skipped rather than re-bought.
export async function POST(req: Request) {
  const db = admin()
  try {
    const { text, items: rawItems, householdId, createdBy } = (await req.json()) as {
      text?: string
      items?: { name?: string; qty?: number }[]
      householdId?: string
      createdBy?: string
    }

    // Build the need list: itemized rows take priority over free text.
    let needs: { name: string; category: string; qty: number }[]
    let skipped: { name: string; reason: string }[]
    let note: string
    if (Array.isArray(rawItems) && rawItems.length) {
      needs = rawItems
        .filter((i) => i.name?.trim())
        .map((i) => ({
          name: i.name!.trim(),
          qty: Math.max(1, Math.floor(Number(i.qty) || 1)),
          category: categorize(i.name!),
        }))
      if (!needs.length) return NextResponse.json({ error: 'items required' }, { status: 400 })
      skipped = []
      note = needs.map((n) => `${n.qty}× ${n.name}`).join(', ')
    } else if (text) {
      const cart = await buildCart(text)
      needs = cart.items
      skipped = [...cart.skipped]
      note = text
    } else {
      return NextResponse.json({ error: 'text or items required' }, { status: 400 })
    }

    // Resolve household (no auth — default to the seeded one).
    let hhId: string | undefined = householdId
    if (!hhId) {
      const { data: hh } = await db.from('households').select('id').limit(1).single()
      if (!hh) return NextResponse.json({ error: 'no household' }, { status: 404 })
      hhId = hh.id as string
    }
    if (!hhId) return NextResponse.json({ error: 'no household' }, { status: 404 })
    let userId = createdBy
    if (!userId) {
      const { data: u } = await db.from('users').select('id').eq('household_id', hhId).limit(1).single()
      userId = u?.id
    }

    // Recency dedupe source — names bought in the last 14 days.
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentRows } = await db
      .from('purchase_items')
      .select('name, purchases!inner(household_id, created_at)')
      .eq('purchases.household_id', hhId)
      .gte('purchases.created_at', since)
    const recentNames = Array.from(
      new Set(((recentRows ?? []) as { name: string }[]).map((r) => r.name))
    )

    const cart = await buildCart(text, recentNames)

    // Union the parsed request with what the predictor says is running low, so
    // "restock the apartment" pulls in due staples the user didn't spell out.
    const due = await dueItems(hhId)
    const seeds: Seed[] = [
      ...cart.items.map((i) => ({ name: i.name, category: i.category as string })),
      ...due.map((d) => ({ name: d.name, category: d.category })),
    ]
    const dueNames = new Set(due.map((d) => d.name.toLowerCase()))

    const plan = await planCart({ householdId: hhId, request: text, seeds, dueNames, recentNames })

    const { data: purchase, error: pErr } = await db
      .from('purchases')
      .insert({ household_id: hhId, status: 'building', subtotal_cents: plan.subtotalCents, note: text, created_by: userId })
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

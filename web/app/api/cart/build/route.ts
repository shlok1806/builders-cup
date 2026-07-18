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
    const { text, householdId, createdBy, cartId } = (await req.json()) as {
      text?: string
      householdId?: string
      createdBy?: string
      cartId?: string
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

    // Running cart: if the client passes an existing building cart, append to it;
    // otherwise open a new one. ponytail: we trust the client's cartId (single
    // household, no auth); scope by household/user once accounts exist.
    let purchaseId: string
    if (cartId) {
      const { data: existing } = await db
        .from('purchases')
        .select('id, status')
        .eq('id', cartId)
        .single()
      if (!existing || existing.status !== 'building') {
        return NextResponse.json({ error: 'cart not open' }, { status: 409 })
      }
      purchaseId = existing.id as string
    } else {
      const { data: purchase, error: pErr } = await db
        .from('purchases')
        .insert({ household_id: hhId, status: 'building', subtotal_cents: 0, note: text, created_by: userId })
        .select('id')
        .single()
      if (pErr) throw pErr
      purchaseId = purchase!.id as string
    }

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

    // Reconcile the cart's stored subtotal + count from all its rows (this build
    // may have appended to items already there).
    const { data: allRows } = await db
      .from('purchase_items')
      .select('unit_price_cents, qty')
      .eq('purchase_id', purchaseId)
    const cartCount = (allRows ?? []).length
    const cartSubtotalCents = (allRows ?? []).reduce(
      (s, r: { unit_price_cents: number; qty: number }) => s + r.unit_price_cents * r.qty,
      0,
    )
    await db.from('purchases').update({ subtotal_cents: cartSubtotalCents }).eq('id', purchaseId)

    return NextResponse.json({
      purchaseId,
      items,
      cartCount,
      cartSubtotalCents,
      skipped: [...cart.skipped, ...plan.skipped],
      dealsCompared: plan.dealsCompared,
      overBudget: plan.overBudget,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

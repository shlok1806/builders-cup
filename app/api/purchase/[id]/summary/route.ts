import { NextResponse } from 'next/server'

import { parseSkippedItems, skippedItemPriceCents, STEPS_COLLAPSED } from '@/lib/payments'
import { admin } from '@/lib/supabase'

type RouteContext = {
  params: Promise<{ id: string }>
}

type PurchaseSummaryRow = {
  note: string | null
}

type ProductPriceRow = {
  name: string
  price_cents: number
}

export async function GET(_request: Request, context: RouteContext) {
  const { id: purchaseId } = await context.params
  const supabase = admin()

  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .select('note')
    .eq('id', purchaseId)
    .single<PurchaseSummaryRow>()

  if (purchaseError || !purchase) {
    return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })
  }

  const skipped = parseSkippedItems(purchase.note)
  const knownSavedCents = skipped.reduce((total, item) => total + skippedItemPriceCents(item), 0)
  const namesNeedingLookup = skipped
    .filter((item) => skippedItemPriceCents(item) === 0 && item.name)
    .map((item) => item.name!.trim().toLowerCase())

  let lookedUpSavedCents = 0
  if (namesNeedingLookup.length > 0) {
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('name,price_cents')
      .returns<ProductPriceRow[]>()

    if (productsError) {
      return NextResponse.json({ error: productsError.message }, { status: 500 })
    }

    const requestedNames = new Set(namesNeedingLookup)
    lookedUpSavedCents = (products ?? []).reduce((total, product) => {
      if (!requestedNames.has(product.name.trim().toLowerCase())) {
        return total
      }

      return total + product.price_cents
    }, 0)
  }

  return NextResponse.json({
    savedCents: knownSavedCents + lookedUpSavedCents,
    stepsCollapsed: STEPS_COLLAPSED,
  })
}

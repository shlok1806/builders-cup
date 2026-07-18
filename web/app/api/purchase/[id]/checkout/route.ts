import { NextResponse } from 'next/server'

import { checkoutPurchase } from '@/lib/checkout'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function POST(_request: Request, context: RouteContext) {
  const { id: purchaseId } = await context.params
  const result = await checkoutPurchase(purchaseId)
  return NextResponse.json(result.body, { status: result.status })
}

export type ChargeStatus = 'succeeded' | 'failed'

export type CheckoutCharge = {
  userId: string
  amountCents: number
  status: ChargeStatus
  stripePaymentIntentId?: string | null
  failureMessage?: string
}

export type ItemSplitForCheckout = {
  user_id: string
  amount_cents: number
}

export type SkippedCartItem = {
  name?: string
  reason?: string
  price_cents?: number
  priceCents?: number
  amount_cents?: number
  amountCents?: number
}

export const STEPS_COLLAPSED = 7

export function aggregateSplitsByUser(splits: ItemSplitForCheckout[]) {
  const totals = new Map<string, number>()

  for (const split of splits) {
    if (!Number.isInteger(split.amount_cents)) {
      throw new Error(`Split for user ${split.user_id} is not integer cents`)
    }

    totals.set(split.user_id, (totals.get(split.user_id) ?? 0) + split.amount_cents)
  }

  return [...totals.entries()]
    .map(([userId, amountCents]) => ({ userId, amountCents }))
    .filter(({ amountCents }) => amountCents > 0)
    .sort((a, b) => a.userId.localeCompare(b.userId))
}

export function parseSkippedItems(note: string | null): SkippedCartItem[] {
  if (!note) {
    return []
  }

  try {
    const parsed = JSON.parse(note) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter(isSkippedCartItem)
    }

    if (isRecord(parsed) && Array.isArray(parsed.skipped)) {
      return parsed.skipped.filter(isSkippedCartItem)
    }
  } catch {
    return []
  }

  return []
}

export function skippedItemPriceCents(item: SkippedCartItem) {
  const candidates = [item.price_cents, item.priceCents, item.amount_cents, item.amountCents]
  const price = candidates.find((value): value is number => Number.isInteger(value))
  return price && price > 0 ? price : 0
}

function isSkippedCartItem(value: unknown): value is SkippedCartItem {
  return isRecord(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

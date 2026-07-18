import Stripe from 'stripe'

export type ChargeUserResult = {
  piId: string | null
  status: 'succeeded' | 'failed'
  failureMessage?: string
}

let stripeClient: Stripe | null = null

export function stripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('Missing Stripe env: STRIPE_SECRET_KEY is required')
  }

  stripeClient ??= new Stripe(secretKey)
  return stripeClient
}

export async function chargeUser(
  customerId: string,
  pmId: string,
  amountCents: number,
  idempotencyKey: string,
): Promise<ChargeUserResult> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(`Stripe charge amount must be positive integer cents; received ${amountCents}`)
  }

  try {
    const paymentIntent = await stripe().paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        customer: customerId,
        payment_method: pmId,
        off_session: true,
        confirm: true,
      },
      { idempotencyKey },
    )

    return {
      piId: paymentIntent.id,
      status: paymentIntent.status === 'succeeded' ? 'succeeded' : 'failed',
    }
  } catch (error) {
    return {
      piId: null,
      status: 'failed',
      failureMessage: error instanceof Error && error.message ? error.message : 'Stripe could not complete the payment',
    }
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const stripeHarness = vi.hoisted(() => {
  class StripeCardError extends Error {}
  class StripeInvalidRequestError extends Error {}

  return {
    createPaymentIntent: vi.fn(),
    StripeCardError,
    StripeInvalidRequestError,
  }
})

vi.mock('stripe', () => {
  class StripeMock {
    static errors = {
      StripeCardError: stripeHarness.StripeCardError,
      StripeInvalidRequestError: stripeHarness.StripeInvalidRequestError,
    }

    paymentIntents = {
      create: stripeHarness.createPaymentIntent,
    }
  }

  return { default: StripeMock }
})

import { chargeUser } from './stripe'

describe('chargeUser', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_contract')
    stripeHarness.createPaymentIntent.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates and confirms an off-session USD PaymentIntent with the supplied idempotency key', async () => {
    stripeHarness.createPaymentIntent.mockResolvedValue({ id: 'pi_succeeded', status: 'succeeded' })

    await expect(chargeUser('cus_sam', 'pm_visa', 1505, 'purchase-7:sam:1505')).resolves.toEqual({
      piId: 'pi_succeeded',
      status: 'succeeded',
    })
    expect(stripeHarness.createPaymentIntent).toHaveBeenCalledWith(
      {
        amount: 1505,
        currency: 'usd',
        customer: 'cus_sam',
        payment_method: 'pm_visa',
        off_session: true,
        confirm: true,
      },
      { idempotencyKey: 'purchase-7:sam:1505' },
    )
  })

  it('maps a non-succeeded PaymentIntent status to failed while retaining its Stripe ID', async () => {
    stripeHarness.createPaymentIntent.mockResolvedValue({ id: 'pi_requires_action', status: 'requires_action' })

    await expect(chargeUser('cus_sam', 'pm_visa', 1505, 'purchase-7:sam:1505')).resolves.toEqual({
      piId: 'pi_requires_action',
      status: 'failed',
    })
  })

  it.each([
    {
      name: 'card rejection',
      error: new stripeHarness.StripeCardError('card declined'),
    },
    {
      name: 'Stripe API rejection',
      error: new Error('Stripe API unavailable'),
    },
  ])('maps a $name to a graceful failed result', async ({ error }) => {
    stripeHarness.createPaymentIntent.mockRejectedValue(error)

    await expect(chargeUser('cus_sam', 'pm_visa', 1505, 'purchase-7:sam:1505')).resolves.toEqual({
      piId: null,
      status: 'failed',
    })
  })
})

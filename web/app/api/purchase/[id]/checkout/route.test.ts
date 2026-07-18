import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeHarness = vi.hoisted(() => ({
  admin: vi.fn(),
  chargeUser: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ admin: routeHarness.admin }))
vi.mock('@/lib/stripe', () => ({ chargeUser: routeHarness.chargeUser }))
vi.mock('@/lib/payments', async () => import('../../../../../lib/payments'))

import { POST } from './route'

type DatabaseResult = Record<string, unknown>
type ScriptedTable = { table: string; query: unknown }

function singleQuery(result: DatabaseResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return query
}

function awaitedQuery(result: DatabaseResult) {
  const select = vi.fn()
  const eq = vi.fn()
  const query = {
    select,
    eq,
    then: (onfulfilled: (value: DatabaseResult) => unknown, onrejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onfulfilled, onrejected),
  }
  select.mockReturnValue(query)
  eq.mockReturnValue(query)
  return query
}

function returnsQuery(result: DatabaseResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    returns: vi.fn().mockResolvedValue(result),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.in.mockReturnValue(query)
  query.order.mockReturnValue(query)
  return query
}

function insertQuery(result: DatabaseResult = { error: null }) {
  return { insert: vi.fn().mockResolvedValue(result) }
}

function updateQuery(result: DatabaseResult = { error: null }) {
  const terminal = { eq: vi.fn().mockResolvedValue(result) }
  return { update: vi.fn(() => terminal), terminal }
}

function scriptAdmin(...tables: ScriptedTable[]) {
  const remaining = [...tables]
  const from = vi.fn((table: string) => {
    const next = remaining.shift()
    if (!next || next.table !== table) {
      throw new Error(`Unexpected table ${table}; expected ${next?.table ?? 'no further query'}`)
    }
    return next.query
  })
  routeHarness.admin.mockReturnValue({ from })
  return from
}

function post(purchaseId = 'purchase-7') {
  return POST(new Request(`http://localhost/api/purchase/${purchaseId}/checkout`, { method: 'POST' }), {
    params: Promise.resolve({ id: purchaseId }),
  })
}

function scriptSingleChargeCheckout(...ledgerTables: ScriptedTable[]) {
  scriptAdmin(
    { table: 'purchases', query: singleQuery({ data: { id: 'purchase-7', status: 'approved' }, error: null }) },
    { table: 'approvals', query: awaitedQuery({ count: 0, error: null }) },
    { table: 'item_splits', query: returnsQuery({ data: [{ user_id: 'sam', amount_cents: 1505 }], error: null }) },
    {
      table: 'payment_methods',
      query: returnsQuery({
        data: [{ user_id: 'sam', stripe_customer_id: 'cus_sam', stripe_pm_id: 'pm_sam' }],
        error: null,
      }),
    },
    ...ledgerTables,
  )
  routeHarness.chargeUser.mockResolvedValue({ piId: 'pi_sam', status: 'succeeded' })
}

describe('POST /api/purchase/[id]/checkout', () => {
  beforeEach(() => {
    routeHarness.admin.mockReset()
    routeHarness.chargeUser.mockReset()
  })

  it('returns the existing ledger for an already charged purchase without charging again', async () => {
    const existing = [
      {
        user_id: 'sam',
        amount_cents: 1505,
        status: 'succeeded',
        stripe_payment_intent_id: 'pi_existing',
      },
    ]
    scriptAdmin(
      { table: 'purchases', query: singleQuery({ data: { id: 'purchase-7', status: 'charged' }, error: null }) },
      { table: 'charges', query: returnsQuery({ data: existing, error: null }) },
    )

    const response = await post()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      charges: [
        {
          userId: 'sam',
          amountCents: 1505,
          status: 'succeeded',
          stripePaymentIntentId: 'pi_existing',
        },
      ],
    })
    expect(routeHarness.chargeUser).not.toHaveBeenCalled()
  })

  it('rejects checkout while any approval is pending and makes no charge', async () => {
    scriptAdmin(
      { table: 'purchases', query: singleQuery({ data: { id: 'purchase-7', status: 'approved' }, error: null }) },
      { table: 'approvals', query: awaitedQuery({ count: 1, error: null }) },
    )

    const response = await post()

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'Purchase still has pending approvals' })
    expect(routeHarness.chargeUser).not.toHaveBeenCalled()
  })

  it('inserts every charge when the ledger is empty and marks an all-success purchase charged', async () => {
    const ledgerSelect = returnsQuery({ data: [], error: null })
    const ledgerInsert = insertQuery()
    const purchaseUpdate = updateQuery()
    scriptAdmin(
      { table: 'purchases', query: singleQuery({ data: { id: 'purchase-7', status: 'approved' }, error: null }) },
      { table: 'approvals', query: awaitedQuery({ count: 0, error: null }) },
      {
        table: 'item_splits',
        query: returnsQuery({
          data: [
            { user_id: 'sam', amount_cents: 1200 },
            { user_id: 'alex', amount_cents: 0 },
            { user_id: 'sam', amount_cents: 305 },
            { user_id: 'priya', amount_cents: 499 },
          ],
          error: null,
        }),
      },
      {
        table: 'payment_methods',
        query: returnsQuery({
          data: [
            { user_id: 'sam', stripe_customer_id: 'cus_sam', stripe_pm_id: 'pm_sam' },
            { user_id: 'priya', stripe_customer_id: 'cus_priya', stripe_pm_id: 'pm_priya' },
          ],
          error: null,
        }),
      },
      { table: 'charges', query: ledgerSelect },
      { table: 'charges', query: ledgerInsert },
      { table: 'purchases', query: purchaseUpdate },
    )
    routeHarness.chargeUser
      .mockResolvedValueOnce({ piId: 'pi_priya', status: 'succeeded' })
      .mockResolvedValueOnce({ piId: 'pi_sam', status: 'succeeded' })

    const response = await post()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      charges: [
        { userId: 'priya', amountCents: 499, status: 'succeeded', stripePaymentIntentId: 'pi_priya' },
        { userId: 'sam', amountCents: 1505, status: 'succeeded', stripePaymentIntentId: 'pi_sam' },
      ],
    })
    expect(routeHarness.chargeUser.mock.calls).toEqual([
      ['cus_priya', 'pm_priya', 499, 'purchase-7:priya:499'],
      ['cus_sam', 'pm_sam', 1505, 'purchase-7:sam:1505'],
    ])
    expect(ledgerInsert.insert).toHaveBeenCalledWith([
      {
        purchase_id: 'purchase-7',
        user_id: 'priya',
        amount_cents: 499,
        stripe_payment_intent_id: 'pi_priya',
        status: 'succeeded',
      },
      {
        purchase_id: 'purchase-7',
        user_id: 'sam',
        amount_cents: 1505,
        stripe_payment_intent_id: 'pi_sam',
        status: 'succeeded',
      },
    ])
    expect(purchaseUpdate.update).toHaveBeenCalledWith({ status: 'charged' })
  })

  it('updates a matching ledger row by id and inserts only the missing charge', async () => {
    const ledgerSelect = returnsQuery({
      data: [{ id: 'charge-priya', user_id: 'priya', amount_cents: 499 }],
      error: null,
    })
    const ledgerUpdate = updateQuery()
    const ledgerInsert = insertQuery()
    const purchaseUpdate = updateQuery()
    scriptAdmin(
      { table: 'purchases', query: singleQuery({ data: { id: 'purchase-7', status: 'approved' }, error: null }) },
      { table: 'approvals', query: awaitedQuery({ count: 0, error: null }) },
      {
        table: 'item_splits',
        query: returnsQuery({
          data: [
            { user_id: 'priya', amount_cents: 499 },
            { user_id: 'sam', amount_cents: 1505 },
          ],
          error: null,
        }),
      },
      {
        table: 'payment_methods',
        query: returnsQuery({
          data: [
            { user_id: 'priya', stripe_customer_id: 'cus_priya', stripe_pm_id: 'pm_priya' },
            { user_id: 'sam', stripe_customer_id: 'cus_sam', stripe_pm_id: 'pm_sam' },
          ],
          error: null,
        }),
      },
      { table: 'charges', query: ledgerSelect },
      { table: 'charges', query: ledgerUpdate },
      { table: 'charges', query: ledgerInsert },
      { table: 'purchases', query: purchaseUpdate },
    )
    routeHarness.chargeUser
      .mockResolvedValueOnce({ piId: 'pi_priya_retry', status: 'succeeded' })
      .mockResolvedValueOnce({ piId: 'pi_sam', status: 'succeeded' })

    const response = await post()

    expect(response.status).toBe(200)
    expect(ledgerUpdate.update).toHaveBeenCalledWith({
      stripe_payment_intent_id: 'pi_priya_retry',
      status: 'succeeded',
    })
    expect(ledgerUpdate.terminal.eq).toHaveBeenCalledWith('id', 'charge-priya')
    expect(ledgerInsert.insert).toHaveBeenCalledWith([
      {
        purchase_id: 'purchase-7',
        user_id: 'sam',
        amount_cents: 1505,
        stripe_payment_intent_id: 'pi_sam',
        status: 'succeeded',
      },
    ])
  })

  it('records a declined user as failed but leaves the purchase available for recovery', async () => {
    const ledgerSelect = returnsQuery({ data: [], error: null })
    const ledgerInsert = insertQuery()
    const purchaseUpdate = updateQuery()
    scriptAdmin(
      { table: 'purchases', query: singleQuery({ data: { id: 'purchase-7', status: 'approved' }, error: null }) },
      { table: 'approvals', query: awaitedQuery({ count: 0, error: null }) },
      {
        table: 'item_splits',
        query: returnsQuery({ data: [{ user_id: 'sam', amount_cents: 1505 }], error: null }),
      },
      {
        table: 'payment_methods',
        query: returnsQuery({
          data: [{ user_id: 'sam', stripe_customer_id: 'cus_sam', stripe_pm_id: 'pm_sam' }],
          error: null,
        }),
      },
      { table: 'charges', query: ledgerSelect },
      { table: 'charges', query: ledgerInsert },
      { table: 'purchases', query: purchaseUpdate },
    )
    routeHarness.chargeUser.mockResolvedValue({ piId: null, status: 'failed' })

    const response = await post()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      charges: [{ userId: 'sam', amountCents: 1505, status: 'failed', stripePaymentIntentId: null }],
    })
    expect(ledgerInsert.insert).toHaveBeenCalledWith([
      {
        purchase_id: 'purchase-7',
        user_id: 'sam',
        amount_cents: 1505,
        stripe_payment_intent_id: null,
        status: 'failed',
      },
    ])
    expect(purchaseUpdate.update).not.toHaveBeenCalled()
  })

  it('preserves succeeded and failed ledger evidence when one PaymentIntent rejects instead of crashing checkout', async () => {
    const ledgerSelect = returnsQuery({ data: [], error: null })
    const ledgerInsert = insertQuery()
    const purchaseUpdate = updateQuery()
    scriptAdmin(
      { table: 'purchases', query: singleQuery({ data: { id: 'purchase-7', status: 'approved' }, error: null }) },
      { table: 'approvals', query: awaitedQuery({ count: 0, error: null }) },
      {
        table: 'item_splits',
        query: returnsQuery({
          data: [
            { user_id: 'priya', amount_cents: 499 },
            { user_id: 'sam', amount_cents: 1505 },
          ],
          error: null,
        }),
      },
      {
        table: 'payment_methods',
        query: returnsQuery({
          data: [
            { user_id: 'priya', stripe_customer_id: 'cus_priya', stripe_pm_id: 'pm_priya' },
            { user_id: 'sam', stripe_customer_id: 'cus_sam', stripe_pm_id: 'pm_sam' },
          ],
          error: null,
        }),
      },
      { table: 'charges', query: ledgerSelect },
      { table: 'charges', query: ledgerInsert },
      { table: 'purchases', query: purchaseUpdate },
    )
    routeHarness.chargeUser
      .mockResolvedValueOnce({ piId: 'pi_priya', status: 'succeeded' })
      .mockRejectedValueOnce(new Error('Stripe API unavailable'))

    const response = await post()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      charges: [
        { userId: 'priya', amountCents: 499, status: 'succeeded', stripePaymentIntentId: 'pi_priya' },
        { userId: 'sam', amountCents: 1505, status: 'failed', stripePaymentIntentId: null },
      ],
    })
    expect(ledgerInsert.insert).toHaveBeenCalledWith([
      {
        purchase_id: 'purchase-7',
        user_id: 'priya',
        amount_cents: 499,
        stripe_payment_intent_id: 'pi_priya',
        status: 'succeeded',
      },
      {
        purchase_id: 'purchase-7',
        user_id: 'sam',
        amount_cents: 1505,
        stripe_payment_intent_id: null,
        status: 'failed',
      },
    ])
    expect(purchaseUpdate.update).not.toHaveBeenCalled()
  })

  it.each<{ stage: string; message: string; ledgerQueries: () => ScriptedTable[] }>([
    {
      stage: 'select',
      message: 'ledger select failed',
      ledgerQueries: () => [
        { table: 'charges', query: returnsQuery({ data: null, error: { message: 'ledger select failed' } }) },
      ],
    },
    {
      stage: 'update',
      message: 'ledger update failed',
      ledgerQueries: () => [
        {
          table: 'charges',
          query: returnsQuery({
            data: [{ id: 'charge-sam', user_id: 'sam', amount_cents: 1505 }],
            error: null,
          }),
        },
        { table: 'charges', query: updateQuery({ error: { message: 'ledger update failed' } }) },
      ],
    },
    {
      stage: 'insert',
      message: 'ledger insert failed',
      ledgerQueries: () => [
        { table: 'charges', query: returnsQuery({ data: [], error: null }) },
        { table: 'charges', query: insertQuery({ error: { message: 'ledger insert failed' } }) },
      ],
    },
  ])('returns HTTP 500 when ledger $stage fails', async ({ message, ledgerQueries }) => {
    scriptSingleChargeCheckout(...ledgerQueries())

    const response = await post()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: message })
  })
})

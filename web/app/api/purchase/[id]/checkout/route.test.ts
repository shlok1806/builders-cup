import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeHarness = vi.hoisted(() => ({ admin: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ admin: routeHarness.admin }))

import { POST } from './route'

type DatabaseResult = Record<string, unknown>
type ScriptedTable = { table: string; query: unknown }

function singleQuery(result: DatabaseResult) {
  const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn().mockResolvedValue(result) }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return query
}

function awaitedQuery(result: DatabaseResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    then: (onfulfilled: (value: DatabaseResult) => unknown, onrejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onfulfilled, onrejected),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return query
}

function splitQuery(result: DatabaseResult) {
  const query = { select: vi.fn(), eq: vi.fn(), returns: vi.fn().mockResolvedValue(result) }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return query
}

function updateQuery(result: DatabaseResult = { error: null }) {
  const terminal = { eq: vi.fn().mockResolvedValue(result) }
  return { update: vi.fn(() => terminal), terminal }
}

function scriptAdmin(...tables: ScriptedTable[]) {
  const remaining = [...tables]
  const from = vi.fn((table: string) => {
    const next = remaining.shift()
    if (!next || next.table !== table) throw new Error(`Unexpected table ${table}; expected ${next?.table ?? 'no further query'}`)
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

describe('POST /api/purchase/[id]/checkout', () => {
  beforeEach(() => routeHarness.admin.mockReset())

  it('is idempotent for an already recorded purchase', async () => {
    scriptAdmin({ table: 'purchases', query: singleQuery({ data: { id: 'purchase-7', status: 'charged' }, error: null }) })

    const response = await post()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ completed: true })
  })

  it('does not record a purchase while any approval remains pending', async () => {
    scriptAdmin(
      { table: 'purchases', query: singleQuery({ data: { id: 'purchase-7', status: 'awaiting_approval' }, error: null }) },
      { table: 'approvals', query: awaitedQuery({ count: 1, error: null }) },
    )

    const response = await post()

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'Purchase still has pending approvals' })
  })

  it('records resolved splits without reading payment methods or creating charges', async () => {
    const purchaseUpdate = updateQuery()
    const from = scriptAdmin(
      { table: 'purchases', query: singleQuery({ data: { id: 'purchase-7', status: 'awaiting_approval' }, error: null }) },
      { table: 'approvals', query: awaitedQuery({ count: 0, error: null }) },
      { table: 'item_splits', query: splitQuery({ data: [{ user_id: 'sam', amount_cents: 1200 }, { user_id: 'priya', amount_cents: 499 }], error: null }) },
      { table: 'purchases', query: purchaseUpdate },
    )

    const response = await post()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ completed: true })
    expect(purchaseUpdate.update).toHaveBeenCalledWith({ status: 'charged' })
    expect(from.mock.calls.map(([table]) => table)).toEqual(['purchases', 'approvals', 'item_splits', 'purchases'])
  })

  it('refuses to record a purchase with no positive split', async () => {
    scriptAdmin(
      { table: 'purchases', query: singleQuery({ data: { id: 'purchase-7', status: 'building' }, error: null }) },
      { table: 'approvals', query: awaitedQuery({ count: 0, error: null }) },
      { table: 'item_splits', query: splitQuery({ data: [{ user_id: 'sam', amount_cents: 0 }], error: null }) },
    )

    const response = await post()

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'No positive item splits to record' })
  })

  it('returns the database error when completion cannot be recorded', async () => {
    scriptAdmin(
      { table: 'purchases', query: singleQuery({ data: { id: 'purchase-7', status: 'building' }, error: null }) },
      { table: 'approvals', query: awaitedQuery({ count: 0, error: null }) },
      { table: 'item_splits', query: splitQuery({ data: [{ user_id: 'sam', amount_cents: 1200 }], error: null }) },
      { table: 'purchases', query: updateQuery({ error: { message: 'completion update failed' } }) },
    )

    const response = await post()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'completion update failed' })
  })
})

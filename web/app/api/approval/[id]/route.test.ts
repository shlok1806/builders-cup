import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  admin: vi.fn(),
  checkoutPurchase: vi.fn(),
  recomputeSubtotal: vi.fn(),
  runSplit: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ admin: harness.admin }))
vi.mock('@/lib/checkout', () => ({ checkoutPurchase: harness.checkoutPurchase }))
vi.mock('@/lib/split-run', () => ({
  recomputeSubtotal: harness.recomputeSubtotal,
  runSplit: harness.runSplit,
}))

import { POST } from './route'

type Result = Record<string, unknown>
type ScriptedTable = { table: string; query: unknown }

function approvalQuery(result: Result) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return query
}

function updateQuery(result: Result = { error: null }) {
  const terminal = { eq: vi.fn().mockResolvedValue(result) }
  return { update: vi.fn(() => terminal), terminal }
}

function countQuery(result: Result) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    then: (onfulfilled: (value: Result) => unknown, onrejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onfulfilled, onrejected),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return query
}

function scriptDb(...tables: ScriptedTable[]) {
  const remaining = [...tables]
  const from = vi.fn((table: string) => {
    const next = remaining.shift()
    if (!next || next.table !== table) {
      throw new Error(`Unexpected table ${table}; expected ${next?.table ?? 'no further query'}`)
    }
    return next.query
  })
  const db = { from }
  harness.admin.mockReturnValue(db)
  return db
}

function approve() {
  return POST(
    new Request('http://localhost/api/approval/approval-3', {
      method: 'POST',
      body: JSON.stringify({ decision: 'approved' }),
    }),
    { params: Promise.resolve({ id: 'approval-3' }) },
  )
}

describe('POST /api/approval/[id]', () => {
  beforeEach(() => {
    harness.admin.mockReset()
    harness.checkoutPurchase.mockReset()
  })

  it('records a non-final approval but does not complete before every approver responds', async () => {
    scriptDb(
      { table: 'approvals', query: approvalQuery({ data: { id: 'approval-3', purchase_id: 'purchase-7', purchase_item_id: 'item-2' } }) },
      { table: 'approvals', query: updateQuery() },
      { table: 'approvals', query: countQuery({ count: 1, error: null }) },
    )

    const response = await approve()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, awaitingOtherApprovals: true })
    expect(harness.checkoutPurchase).not.toHaveBeenCalled()
  })

  it('records the purchase only after the final approval', async () => {
    const db = scriptDb(
      { table: 'approvals', query: approvalQuery({ data: { id: 'approval-3', purchase_id: 'purchase-7', purchase_item_id: 'item-2' } }) },
      { table: 'approvals', query: updateQuery() },
      { table: 'approvals', query: countQuery({ count: 0, error: null }) },
    )
    harness.checkoutPurchase.mockResolvedValue({ status: 200, body: { completed: true } })

    const response = await approve()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, completed: true })
    expect(harness.checkoutPurchase).toHaveBeenCalledWith('purchase-7', db)
  })
})

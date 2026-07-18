import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({ admin: vi.fn(), savingsVsSecond: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ admin: harness.admin }))
vi.mock('@/lib/deals', () => ({ savingsVsSecond: harness.savingsVsSecond }))

import { GET } from './route'

// The route reads the purchase's line items, then sums the per-unit deal savings
// (cheapest offer vs runner-up, via savingsVsSecond) across them. stepsCollapsed
// is the fixed narrative integer (build -> split -> chase -> settle).
function mockItems(items: { product_id: string | null; qty: number }[]) {
  const query = { select: vi.fn(), eq: vi.fn() }
  query.select.mockReturnValue(query)
  query.eq.mockResolvedValue({ data: items, error: null })
  const from = vi.fn((table: string) => {
    if (table !== 'purchase_items') throw new Error(`Unexpected table ${table}; expected purchase_items`)
    return query
  })
  harness.admin.mockReturnValue({ from })
  return from
}

function getSummary(purchaseId = 'purchase-7') {
  return GET(new Request(`http://localhost/api/purchase/${purchaseId}/summary`), {
    params: Promise.resolve({ id: purchaseId }),
  })
}

describe('GET /api/purchase/[id]/summary', () => {
  beforeEach(() => {
    harness.admin.mockReset()
    harness.savingsVsSecond.mockReset()
  })

  it('sums per-unit deal savings across line items and returns the collapsed-step count', async () => {
    mockItems([
      { product_id: 'p-coffee', qty: 2 },
      { product_id: 'p-chips', qty: 1 },
    ])
    harness.savingsVsSecond.mockImplementation(async (pid: string) => (pid === 'p-coffee' ? 150 : 40))

    const response = await getSummary()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ savedCents: 340, dealSavingsCents: 340, stepsCollapsed: 4 })
  })

  it('computes each product only once even when it spans multiple lines', async () => {
    mockItems([
      { product_id: 'p-coffee', qty: 1 },
      { product_id: 'p-coffee', qty: 3 },
    ])
    harness.savingsVsSecond.mockResolvedValue(100)

    const response = await getSummary()

    await expect(response.json()).resolves.toEqual({ savedCents: 400, dealSavingsCents: 400, stepsCollapsed: 4 })
    expect(harness.savingsVsSecond).toHaveBeenCalledTimes(1)
  })

  it('ignores line items with no product and reports zero when nothing has a runner-up', async () => {
    mockItems([
      { product_id: null, qty: 5 },
      { product_id: 'p-x', qty: 1 },
    ])
    harness.savingsVsSecond.mockResolvedValue(0)

    const response = await getSummary()

    await expect(response.json()).resolves.toEqual({ savedCents: 0, dealSavingsCents: 0, stepsCollapsed: 4 })
  })
})

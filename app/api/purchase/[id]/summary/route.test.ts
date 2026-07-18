import { beforeEach, describe, expect, it, vi } from 'vitest'

const summaryHarness = vi.hoisted(() => ({ admin: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ admin: summaryHarness.admin }))
vi.mock('@/lib/payments', async () => import('../../../../../lib/payments'))

import { GET } from './route'

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

function returnsQuery(result: DatabaseResult) {
  const query = {
    select: vi.fn(),
    returns: vi.fn().mockResolvedValue(result),
  }
  query.select.mockReturnValue(query)
  return query
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
  summaryHarness.admin.mockReturnValue({ from })
  return from
}

function getSummary(purchaseId = 'purchase-7') {
  return GET(new Request(`http://localhost/api/purchase/${purchaseId}/summary`), {
    params: Promise.resolve({ id: purchaseId }),
  })
}

describe('GET /api/purchase/[id]/summary', () => {
  beforeEach(() => {
    summaryHarness.admin.mockReset()
  })

  it('computes saved cents from persisted skipped items and returns the fixed collapsed-step narrative', async () => {
    scriptAdmin(
      {
        table: 'purchases',
        query: singleQuery({
          data: {
            note: JSON.stringify({
              skipped: [
                { name: 'paper towels', price_cents: 899, reason: 'already stocked' },
                { name: ' Sparkling Water ', reason: 'duplicate request' },
              ],
            }),
          },
          error: null,
        }),
      },
      {
        table: 'products',
        query: returnsQuery({
          data: [
            { name: 'sparkling water', price_cents: 499 },
            { name: 'unrelated product', price_cents: 9999 },
          ],
          error: null,
        }),
      },
    )

    const response = await getSummary()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ savedCents: 1398, stepsCollapsed: 7 })
  })

  it.each([
    { name: 'an absent note', note: null },
    { name: 'a malformed note', note: '{not-json' },
  ])('handles $name without inventing savings', async ({ note }) => {
    const from = scriptAdmin({
      table: 'purchases',
      query: singleQuery({ data: { note }, error: null }),
    })

    const response = await getSummary()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ savedCents: 0, stepsCollapsed: 7 })
    expect(from).toHaveBeenCalledTimes(1)
  })
})

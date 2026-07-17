import { it, expect } from 'vitest'
import { computeSplit } from './split'
import type { Member, Line } from './types'

const [sam, priya, alex, jordan] = ['s', 'p', 'a', 'j']
const members: Member[] = [
  { userId: sam, weight: 1, excludedCategories: [], approvalThresholdCents: 4000 },
  { userId: priya, weight: 1, excludedCategories: ['alcohol'], approvalThresholdCents: null },
  { userId: alex, weight: 1, excludedCategories: ['meat'], approvalThresholdCents: null },
  { userId: jordan, weight: 1, excludedCategories: [], approvalThresholdCents: null },
]
const lines: Line[] = [
  { itemId: 'plain', category: 'snacks', lineTotalCents: 1000 }, // even 4-way
  { itemId: 'booze', category: 'alcohol', lineTotalCents: 5200 }, // priya excluded + trips Sam $40
  { itemId: 'steak', category: 'meat', lineTotalCents: 3000 }, // alex excluded
]

it('every line reconciles to its total', () => {
  const { allocations } = computeSplit(lines, members)
  for (const l of lines) {
    const sum = allocations
      .filter((a) => a.itemId === l.itemId)
      .reduce((s, a) => s + a.amountCents, 0)
    expect(sum).toBe(l.lineTotalCents)
  }
})
it('excludes the right users', () => {
  const { allocations } = computeSplit(lines, members)
  expect(allocations.find((a) => a.itemId === 'booze' && a.userId === priya)).toBeUndefined()
  expect(allocations.find((a) => a.itemId === 'steak' && a.userId === alex)).toBeUndefined()
})
it('flags exactly the over-threshold line to its approver', () => {
  const { flagged } = computeSplit(lines, members)
  expect(flagged).toHaveLength(1)
  expect(flagged[0]).toMatchObject({ itemId: 'booze', approverId: sam })
})
it('orphan rule: all-excluded line falls back to full household', () => {
  const all = members.map((m) => ({ ...m, excludedCategories: ['snacks'] }))
  const { allocations } = computeSplit([lines[0]], all)
  expect(allocations.filter((a) => a.itemId === 'plain')).toHaveLength(4)
})
it('split_weight: a 2x member pays double share, line still reconciles', () => {
  const weighted = members.map((m) => (m.userId === jordan ? { ...m, weight: 2 } : m))
  const { allocations } = computeSplit([lines[0]], weighted) // $10.00 plain, weights 1:1:1:2
  const share = (u: string) =>
    allocations.find((a) => a.itemId === 'plain' && a.userId === u)!.amountCents
  expect(share(jordan)).toBe(2 * share(sam))
  expect(allocations.filter((a) => a.itemId === 'plain').reduce((s, a) => s + a.amountCents, 0)).toBe(
    1000
  )
})

import { it, expect } from 'vitest'
import { computeSplit } from './split'
import type { Member, Line } from './types'

const [sam, priya, alex, jordan] = ['s', 'p', 'a', 'j']
const members: Member[] = [
  { userId: sam, weight: 1, excludedCategories: [], excludedItems: [], approvalThresholdCents: 4000 },
  { userId: priya, weight: 1, excludedCategories: ['alcohol'], excludedItems: [], approvalThresholdCents: null },
  { userId: alex, weight: 1, excludedCategories: ['meat'], excludedItems: [], approvalThresholdCents: null },
  { userId: jordan, weight: 1, excludedCategories: [], excludedItems: [], approvalThresholdCents: null },
]
const lines: Line[] = [
  { itemId: 'plain', name: 'Tortilla chips', category: 'snacks', lineTotalCents: 1000 }, // even 4-way
  { itemId: 'booze', name: 'Tequila', category: 'alcohol', lineTotalCents: 5200 }, // priya excluded + trips Sam $40
  { itemId: 'steak', name: 'Ribeye steak', category: 'meat', lineTotalCents: 3000 }, // alex excluded
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
it('exclude_item: a member is dropped only from the line whose name matches the keyword', () => {
  const bread: Line = { itemId: 'bread', name: 'Sourdough bread', category: 'groceries', lineTotalCents: 800 }
  const noBread = members.map((m) => (m.userId === sam ? { ...m, excludedItems: ['bread'] } : m))
  const { allocations } = computeSplit([bread, lines[0]], noBread)
  // Sam is off the bread line...
  expect(allocations.find((a) => a.itemId === 'bread' && a.userId === sam)).toBeUndefined()
  expect(allocations.filter((a) => a.itemId === 'bread')).toHaveLength(3)
  // ...but still on other lines, and bread still reconciles to its total.
  expect(allocations.find((a) => a.itemId === 'plain' && a.userId === sam)).toBeDefined()
  expect(allocations.filter((a) => a.itemId === 'bread').reduce((s, a) => s + a.amountCents, 0)).toBe(800)
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

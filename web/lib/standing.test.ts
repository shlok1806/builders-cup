import { it, expect } from 'vitest'
import { applyStandingDecisions, type FlagEntry } from './standing'

const flags: FlagEntry[] = [
  { itemId: 'i1', approverId: 'sam', rule: 'over $40' },
  { itemId: 'i2', approverId: 'priya', rule: 'over $40' },
  { itemId: 'i3', approverId: 'alex', rule: 'over $40' },
]

it('no standing rows: everything stays pending (ask is the default)', () => {
  const r = applyStandingDecisions(flags, {})
  expect(r.pending).toHaveLength(3)
  expect(r.autoApproved).toHaveLength(0)
  expect(r.dropItemIds).toHaveLength(0)
})

it('always auto-approves that approver, never drops the item, rest ask', () => {
  const r = applyStandingDecisions(flags, { sam: 'always', priya: 'never' })
  expect(r.autoApproved.map((f) => f.itemId)).toEqual(['i1'])
  expect(r.dropItemIds).toEqual(['i2'])
  expect(r.pending.map((f) => f.itemId)).toEqual(['i3'])
})

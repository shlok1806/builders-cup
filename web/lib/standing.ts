// Applies a recurring cart's standing approval verdicts to the lines a split
// flagged. 'always' auto-approves that approver's line; 'never' drops the item;
// anything else (no row = "ask") stays pending. Pure — no DB, unit-tested.

export type FlagEntry = { itemId: string; approverId: string; rule: string }
export type StandingMap = Record<string, 'always' | 'never'> // approverId -> decision

export function applyStandingDecisions(
  flagged: FlagEntry[],
  standing: StandingMap,
): { pending: FlagEntry[]; autoApproved: FlagEntry[]; dropItemIds: string[] } {
  const pending: FlagEntry[] = []
  const autoApproved: FlagEntry[] = []
  const dropItemIds: string[] = []
  for (const f of flagged) {
    const d = standing[f.approverId]
    if (d === 'always') autoApproved.push(f)
    else if (d === 'never') dropItemIds.push(f.itemId)
    else pending.push(f)
  }
  return { pending, autoApproved, dropItemIds }
}

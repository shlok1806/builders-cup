import type { Member, Line, SplitResult, Allocation, Flag } from './types'

// Deterministic split engine — architecture.md §12. No LLM on this path.
// Order: exclude → orphan-restore → weight → largest-remainder round → flag.
// Callers sort `members` by userId first so "first matching threshold owns the
// approval" is deterministic and not dependent on DB row order.
export function computeSplit(lines: Line[], members: Member[]): SplitResult {
  const allocations: Allocation[] = []
  const flagged: Flag[] = []
  for (const line of lines) {
    // 1-2. exclusions, with orphan restore (an exclusion can't zero a real cost)
    let onLine = members.filter((m) => !m.excludedCategories.includes(line.category))
    if (onLine.length === 0) onLine = members
    // 3. weights
    const totalWeight = onLine.reduce((s, m) => s + m.weight, 0)
    // 4. largest-remainder rounding — per-user cents sum exactly to the line total
    const raw = onLine.map((m) => (line.lineTotalCents * m.weight) / totalWeight)
    const floors = raw.map(Math.floor)
    const remainder = line.lineTotalCents - floors.reduce((s, n) => s + n, 0)
    const order = raw
      .map((r, i) => ({ i, frac: r - floors[i] }))
      .sort((a, b) => b.frac - a.frac)
    const cents = floors.slice()
    for (let k = 0; k < remainder; k++) cents[order[k].i]++
    onLine.forEach((m, i) =>
      allocations.push({ itemId: line.itemId, userId: m.userId, amountCents: cents[i] })
    )
    // 5. flag: first (lowest-index) surviving member whose threshold the line total hits
    const approver = onLine.find(
      (m) => m.approvalThresholdCents != null && line.lineTotalCents >= m.approvalThresholdCents
    )
    if (approver)
      flagged.push({
        itemId: line.itemId,
        approverId: approver.userId,
        rule: `over $${(approver.approvalThresholdCents! / 100).toFixed(0)} approval threshold`,
      })
  }
  return { allocations, flagged }
}

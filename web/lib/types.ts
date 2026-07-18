// Split-engine types — the P3 contract (architecture.md §12).
// DB row types get added here in Phase 0; this is the engine slice.

export type Member = {
  userId: string
  weight: number // default 1
  excludedCategories: string[]
  approvalThresholdCents: number | null
}
export type Line = { itemId: string; category: string; lineTotalCents: number }
export type Allocation = { itemId: string; userId: string; amountCents: number }
export type Flag = { itemId: string; approverId: string; rule: string }
export type SplitResult = { allocations: Allocation[]; flagged: Flag[] }

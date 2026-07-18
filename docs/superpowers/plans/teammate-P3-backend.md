# Cartel — P3: Backend / Data (split engine, approvals, queries)

**You own:** the deterministic split engine (the core), approval logic, realtime wiring, dashboard queries — and you lead the schema + seed in Phase 0. Features **F4, F5-logic, F7-queries.**
**Full spec:** `architecture.md` §4, §12. **Master plan:** `docs/superpowers/plans/2026-07-17-cartel.md`.

## Your global constraints
- **Money is deterministic — no LLM on this path.** §12 of `architecture.md` is your contract.
- **Largest-remainder rounding:** per-user cents sum **exactly** to each line total.
- **Split order:** exclude → orphan-restore (if a line empties, restore full household) → weight → round → flag.
- **`Line.lineTotalCents` = `unit_price_cents × qty`** — always multiply; never pass unit price alone.
- **`split_weight` is live:** fold `{weight:N}` into `member.weight` (default 1). Jordan is seeded `split_weight {weight:2}`.
- **Flag** when `line_total (unit_price × qty) ≥` a surviving user's `approval_threshold`. First matching rule owns the approval — **sort members by userId before splitting** so "first" is deterministic (not DB row order). Never two approvers on one line.
- **Decline** → delete the line, recompute subtotal, re-split.
- Only the **split engine is TDD'd**; the rest is smoke-verified.

## Interfaces you consume
- `admin()` server client (`lib/supabase.ts`, Phase 0).

## Interfaces you produce (others depend on these)
```ts
// lib/types.ts
export type Member = { userId:string; weight:number; excludedCategories:string[]; approvalThresholdCents:number|null }
export type Line = { itemId:string; category:string; lineTotalCents:number }
export type Allocation = { itemId:string; userId:string; amountCents:number }
export type Flag = { itemId:string; approverId:string; rule:string }
export type SplitResult = { allocations: Allocation[]; flagged: Flag[] }
// lib/split.ts
export function computeSplit(lines: Line[], members: Member[]): SplitResult
```
- `POST /api/purchase/[id]/split → { lines:[{itemId,name,category,lineTotalCents, splits:[{userId,amountCents}], flag?:{approverId,rule}}] }` (writes `item_splits` + `approvals`)
- `POST /api/approval/[id] { decision } → { ok }`
- `GET /api/dashboard → { thisMonthCents, byCategory, byUser, budgetCents, overBudget }`

## Phase 0 (you LEAD 0.2 + 0.3)
- **Task 0.2 — schema migration:** write `supabase/migrations/0001_init.sql` (all 10 tables, 3-type policy enum, `households.monthly_budget_cents`, `alter publication supabase_realtime add table approvals`). Full SQL in master plan. Apply + verify all tables exist. **BLOCKING realtime gate:** prove an **anon-key** client actually receives a live `approvals` insert (subscribe, then insert a row) — not just that the publication lists the table. If nothing arrives, RLS-off can suppress anon delivery: `alter table approvals enable row level security; create policy "realtime read" on approvals for select using (true);` (everything else stays RLS-off). Re-test until it fires.
- **Task 0.3 — seed:** `supabase/seed.ts` — household ($1,500 budget), 4 users w/ policies (Sam $40 threshold, Priya excl alcohol, Alex excl meat, **Jordan `split_weight {weight:2}`**), catalog incl. tequila $5,200 + a **plain snack line whose total is a multiple of 5** (e.g. $10.00, so Jordan's 2× share is exact cents), **backdated** prior purchases (`purchases.created_at` earlier this month, incl. paper towels for dedupe). P4 adds the Stripe customer/PM part. Idempotent wipe-and-reinsert.

---

## Task P3.1: Split engine + unit test — TDD, THE CONTRACT
**Files:** Create `lib/split.ts`, `lib/split.test.ts`, `lib/types.ts`
- [ ] **Write the failing test** against the §12 canonical cart (plain 4-way, alcohol w/ Priya excluded + trips Sam, meat w/ Alex excluded). Assert: every line reconciles to its total; excluded users absent; exactly one flag → Sam; orphan rule restores full household.

```ts
import { describe, it, expect } from 'vitest'
import { computeSplit } from './split'
import type { Member, Line } from './types'
const [sam,priya,alex,jordan] = ['s','p','a','j']
const members: Member[] = [
  { userId:sam, weight:1, excludedCategories:[], approvalThresholdCents:4000 },
  { userId:priya, weight:1, excludedCategories:['alcohol'], approvalThresholdCents:null },
  { userId:alex, weight:1, excludedCategories:['meat'], approvalThresholdCents:null },
  { userId:jordan, weight:1, excludedCategories:[], approvalThresholdCents:null },
]
const lines: Line[] = [
  { itemId:'plain', category:'snacks', lineTotalCents:1000 },
  { itemId:'booze', category:'alcohol', lineTotalCents:5200 },
  { itemId:'steak', category:'meat', lineTotalCents:3000 },
]
it('every line reconciles', () => {
  const { allocations } = computeSplit(lines, members)
  for (const l of lines) {
    const s = allocations.filter(a=>a.itemId===l.itemId).reduce((x,a)=>x+a.amountCents,0)
    expect(s).toBe(l.lineTotalCents)
  }
})
it('excludes correctly', () => {
  const { allocations } = computeSplit(lines, members)
  expect(allocations.find(a=>a.itemId==='booze'&&a.userId===priya)).toBeUndefined()
  expect(allocations.find(a=>a.itemId==='steak'&&a.userId===alex)).toBeUndefined()
})
it('one flag to Sam', () => {
  const { flagged } = computeSplit(lines, members)
  expect(flagged).toHaveLength(1)
  expect(flagged[0]).toMatchObject({ itemId:'booze', approverId:sam })
})
it('orphan restores full household', () => {
  const all = members.map(m=>({ ...m, excludedCategories:['snacks'] }))
  const { allocations } = computeSplit([lines[0]], all)
  expect(allocations.filter(a=>a.itemId==='plain')).toHaveLength(4)
})
it('split_weight: 2x member pays double, line reconciles', () => {
  const weighted = members.map(m => m.userId===jordan ? { ...m, weight:2 } : m)
  const { allocations } = computeSplit([lines[0]], weighted) // $10.00, weights 1:1:1:2
  const share = (u:string) => allocations.find(a=>a.itemId==='plain'&&a.userId===u)!.amountCents
  expect(share(jordan)).toBe(2*share(sam))
  expect(allocations.filter(a=>a.itemId==='plain').reduce((s,a)=>s+a.amountCents,0)).toBe(1000)
})
```

- [ ] **Run to verify it fails:** `npx vitest run lib/split.test.ts` → FAIL.
- [ ] **Implement** per §12:

```ts
import type { Member, Line, SplitResult, Allocation, Flag } from './types'
export function computeSplit(lines: Line[], members: Member[]): SplitResult {
  const allocations: Allocation[] = []; const flagged: Flag[] = []
  for (const line of lines) {
    let onLine = members.filter(m => !m.excludedCategories.includes(line.category))
    if (onLine.length === 0) onLine = members                    // orphan rule
    const totalWeight = onLine.reduce((s,m)=>s+m.weight, 0)
    const raw = onLine.map(m => (line.lineTotalCents * m.weight) / totalWeight)
    const floors = raw.map(Math.floor)
    const remainder = line.lineTotalCents - floors.reduce((s,n)=>s+n, 0)
    const order = raw.map((r,i)=>({ i, frac: r-floors[i] })).sort((a,b)=>b.frac-a.frac)
    const cents = floors.slice()
    for (let k=0;k<remainder;k++) cents[order[k].i]++
    onLine.forEach((m,i)=>allocations.push({ itemId:line.itemId, userId:m.userId, amountCents:cents[i] }))
    const approver = onLine.find(m => m.approvalThresholdCents!=null && line.lineTotalCents >= m.approvalThresholdCents)
    if (approver) flagged.push({ itemId:line.itemId, approverId:approver.userId,
      rule:`over $${(approver.approvalThresholdCents!/100).toFixed(0)} approval threshold` })
  }
  return { allocations, flagged }
}
```

- [ ] **Run to verify it passes:** `npx vitest run lib/split.test.ts` → all PASS.
- [ ] Commit: `git commit -m "feat: deterministic split engine + unit test (§12 contract)"`

## Task P3.2: Split route — writes item_splits + approvals — F4
**Files:** Create `app/api/purchase/[id]/split/route.ts` (extract a shared `runSplit(purchaseId)` helper — P3.3 reuses it)
- [ ] Load the purchase's `purchase_items` + all household `policies`. Build `Line[]` with **`lineTotalCents = unit_price_cents × qty`** (multiply explicitly). Fold each user's policies into `Member[]`: `exclude_category` → `excludedCategories`, `approval_threshold` → `approvalThresholdCents`, **`split_weight` → `weight` (default 1)**. **Sort members by `userId`** before `computeSplit` so the flag owner is deterministic.
- [ ] `computeSplit(...)`. Delete existing `item_splits` for these items (idempotent), insert new.
- [ ] Upsert `approvals` (pending) per flag; set `purchases.status = 'awaiting_approval'` if any flag, else `building`.
- [ ] Return the split-view payload (join names). Verify seeded cart: booze 3 payers + flag, steak 3, plain 4, totals reconcile.
- [ ] Commit: `git commit -m "feat: split route → item_splits + approvals"`

## Task P3.3: Approval route (approve / decline + re-split) — F5 logic
**Files:** Create `app/api/approval/[id]/route.ts`
- [ ] Update the `approvals` status.
- [ ] On `declined`: delete the `purchase_item` (cascades splits), recompute `subtotal_cents`, call `runSplit(purchaseId)`.
- [ ] On `approved`: if no `approvals` remain pending, set status back to `building` (checkout-ready). Verify both branches.
- [ ] Commit: `git commit -m "feat: approval approve/decline + re-split"`

## Task P3.3b: Pending-approvals query — F5 support (poll fallback + device load)
**Files:** Create `app/api/approvals/route.ts`
`GET /api/approvals?user=<id> → { pending:[{id,purchaseId,purchaseItemId,approverId,rule,itemName,amountCents}] }`
Realtime only delivers events fired *after* a client subscribes — an approval already `pending` when the approver's phone connects emits nothing. This endpoint backs both the device's initial load **and** P1's `NEXT_PUBLIC_REALTIME=0` poll fallback (which otherwise has nothing to poll).
- [ ] Select `approvals` where `approver_id = user` and `status='pending'`, join item name + line total. Verify: after the split flags the tequila, `GET /api/approvals?user=<sam>` returns one row.
- [ ] Commit: `git commit -m "feat: pending approvals query (poll fallback + device load)"`

## Task P3.4: Dashboard query route — F7
**Files:** Create `app/api/dashboard/route.ts`
- [ ] Aggregate `item_splits` joined to `purchase_items`/`purchases` for the household, filtered to current month by **`purchases.created_at`** (NOT `item_splits.created_at` — that's stamped today at split time and hides the backdated prior purchases). Group by category + by user.
- [ ] Read `households.monthly_budget_cents`; `overBudget = thisMonthCents > budgetCents`. Verify non-zero (backdated seed).
- [ ] Commit: `git commit -m "feat: dashboard aggregation route"`

## Integration gates you're on
- **I1:** P2 cart → your split → P1 SplitView. **I2:** live rule → your re-split reflects it.
- **I3:** your flag → realtime → approve → checkout unblocks (with P1). **I4:** checkout → your dashboard updates (with P4, P1).

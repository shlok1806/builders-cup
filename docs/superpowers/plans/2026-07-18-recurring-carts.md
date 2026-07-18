# Recurring Carts + Standing Approvals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a household save named recurring carts and remember an approver's verdict per cart — always auto-approve, always auto-decline, or keep asking.

**Architecture:** Two new tables (`recurring_carts`, `recurring_cart_approvals`) + a nullable `purchases.recurring_cart_id`. A reorder route rebuilds a saved cart into a fresh purchase and runs the existing split. One pure function (`applyStandingDecisions`) decides, per flagged line, whether the standing verdict auto-approves it, drops it, or leaves it pending; `runSplit` calls it. Two UI surfaces write the verdict: an inline control on the approval device and a list in settings. "ask" is the *absence* of a row, so existing behavior is the untouched default.

**Tech Stack:** Next.js (App Router — read `node_modules/next/dist/docs/` before writing route code), Supabase (`@/lib/supabase` `admin()`), vitest (pure-function tests only), Tailwind.

## Global Constraints

- Integer cents / integer qty everywhere. Never store or compute fractional money.
- Line total is always `unit_price_cents * qty`, never unit price alone.
- No auth: `userId`/`approverId` arrive in the request body; persist a user FK only when it's a real UUID (see `isUuid` usage in `agent-data.ts`).
- `Date.now()`/`new Date()` are fine in route code (server), NOT in vitest pure-logic files.
- Migrations follow `0001_init.sql` conventions: `gen_random_uuid()` PKs, `timestamptz default now()`.
- `decision` is only ever persisted as `'always'` or `'never'`. `'ask'` = no row.
- Spec: `docs/superpowers/specs/2026-07-17-recurring-carts-standing-approvals-design.md`.

---

### Task 1: Migration + seed

**Files:**
- Create: `web/supabase/migrations/0002_recurring_carts.sql`
- Modify: `web/supabase/seed.ts` (append one recurring cart after products/users exist)

**Interfaces:**
- Produces: tables `recurring_carts(id, owner_id, household_id, name, items jsonb, created_at)`, `recurring_cart_approvals(id, recurring_cart_id, approver_id, decision, updated_at, unique(recurring_cart_id, approver_id))`, and column `purchases.recurring_cart_id`.

- [ ] **Step 1: Write the migration**

Create `web/supabase/migrations/0002_recurring_carts.sql`:

```sql
create table recurring_carts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references users(id),
  household_id uuid references households(id),
  name text not null,
  items jsonb not null,
  created_at timestamptz default now()
);

create table recurring_cart_approvals (
  id uuid primary key default gen_random_uuid(),
  recurring_cart_id uuid references recurring_carts(id) on delete cascade,
  approver_id uuid references users(id),
  decision text not null check (decision in ('always','never')),
  updated_at timestamptz default now(),
  unique (recurring_cart_id, approver_id)
);

alter table purchases add column recurring_cart_id uuid references recurring_carts(id);
```

- [ ] **Step 2: Apply the migration**

Run it against the project (MCP `apply_migration` with name `0002_recurring_carts`, or `supabase db push` if using the CLI). Confirm no error.

- [ ] **Step 3: Seed one recurring cart**

Open `web/supabase/seed.ts`, find where products and users are already inserted, and after them add one recurring cart owned by the household using two existing product ids (reuse variables already in scope for product ids; pick two grocery-ish ones):

```ts
// Recurring cart so the reorder flow has something to run in the demo.
await db.from('recurring_carts').insert({
  name: 'Weekly groceries',
  owner_id: /* an existing seeded user id in scope */,
  household_id: /* the seeded household id in scope */,
  items: [
    { product_id: /* existing product id */, qty: 2 },
    { product_id: /* another existing product id */, qty: 1 },
  ],
})
```

- [ ] **Step 4: Verify**

Run: `cd web && npm run seed`
Expected: completes without error. Then confirm the row exists (MCP `execute_sql`: `select name, items from recurring_carts;`) — one "Weekly groceries" row with two items.

- [ ] **Step 5: Commit**

```bash
git add web/supabase/migrations/0002_recurring_carts.sql web/supabase/seed.ts
git commit -m "feat: recurring carts schema + seed"
```

---

### Task 2: `applyStandingDecisions` pure function + test

**Files:**
- Create: `web/lib/standing.ts`
- Test: `web/lib/standing.test.ts`

**Interfaces:**
- Consumes: `flagged` entries shaped `{ itemId: string; approverId: string; rule: string }` (this is what `computeSplit` returns in `web/lib/split.ts`).
- Produces:
  ```ts
  export type FlagEntry = { itemId: string; approverId: string; rule: string }
  export type StandingMap = Record<string, 'always' | 'never'> // approverId -> decision
  export function applyStandingDecisions(
    flagged: FlagEntry[],
    standing: StandingMap,
  ): { pending: FlagEntry[]; autoApproved: FlagEntry[]; dropItemIds: string[] }
  ```

- [ ] **Step 1: Write the failing test**

Create `web/lib/standing.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/standing.test.ts`
Expected: FAIL — cannot find module `./standing`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/standing.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/standing.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/standing.ts web/lib/standing.test.ts
git commit -m "feat: applyStandingDecisions pure logic + tests"
```

---

### Task 3: Wire standing decisions into `runSplit`

**Files:**
- Modify: `web/lib/split-run.ts`

**Interfaces:**
- Consumes: `applyStandingDecisions`, `StandingMap` from `./standing`; `purchases.recurring_cart_id`; `recurring_cart_approvals` rows.
- Produces: `runSplit` behavior — a recurring purchase's flagged lines are auto-approved / dropped / left pending per the approver's standing verdict. Non-recurring purchases (`recurring_cart_id = null`) are unchanged.

- [ ] **Step 1: Add the import and load `recurring_cart_id`**

In `web/lib/split-run.ts`, add near the top imports:

```ts
import { applyStandingDecisions, type StandingMap } from './standing'
```

Change the purchase select (currently `select('id, household_id')`) to include the link:

```ts
    .select('id, household_id, recurring_cart_id')
```

- [ ] **Step 2: Load the standing map after `computeSplit`**

Immediately after `const { allocations, flagged } = computeSplit(lines, members)`, insert:

```ts
  // Recurring cart? Fold in the approvers' standing verdicts.
  let standing: StandingMap = {}
  if (purchase.recurring_cart_id && flagged.length) {
    const { data: rows } = await db
      .from('recurring_cart_approvals')
      .select('approver_id, decision')
      .eq('recurring_cart_id', purchase.recurring_cart_id)
      .in('approver_id', flagged.map((f) => f.approverId))
    standing = Object.fromEntries((rows ?? []).map((r) => [r.approver_id, r.decision])) as StandingMap
  }
  const { pending, autoApproved, dropItemIds } = applyStandingDecisions(flagged, standing)
  const dropSet = new Set(dropItemIds)
```

- [ ] **Step 3: Drop 'never' items and exclude them from splits**

Replace the item_splits rewrite block so dropped items are removed and their allocations are never inserted. Change:

```ts
  const itemIds = itemRows.map((it) => it.id)
  if (itemIds.length) await db.from('item_splits').delete().in('purchase_item_id', itemIds)
  if (allocations.length)
    await db.from('item_splits').insert(
      allocations.map((a) => ({
        purchase_item_id: a.itemId,
        user_id: a.userId,
        amount_cents: a.amountCents,
      }))
    )
```

to:

```ts
  const itemIds = itemRows.map((it) => it.id)
  if (itemIds.length) await db.from('item_splits').delete().in('purchase_item_id', itemIds)
  // 'never' verdict: delete the flagged item (cascades its splits + approvals) and
  // never insert its allocations. Per-line independence means other lines are unaffected.
  if (dropItemIds.length) await db.from('purchase_items').delete().in('id', dropItemIds)
  const keptAllocations = allocations.filter((a) => !dropSet.has(a.itemId))
  if (keptAllocations.length)
    await db.from('item_splits').insert(
      keptAllocations.map((a) => ({
        purchase_item_id: a.itemId,
        user_id: a.userId,
        amount_cents: a.amountCents,
      }))
    )
```

- [ ] **Step 4: Insert pending + auto-approved approvals; set status**

Replace the approvals block. Change:

```ts
  await db.from('approvals').delete().eq('purchase_id', purchaseId).eq('status', 'pending')
  if (flagged.length)
    await db.from('approvals').insert(
      flagged.map((f) => ({
        purchase_id: purchaseId,
        purchase_item_id: f.itemId,
        approver_id: f.approverId,
        rule: f.rule,
        status: 'pending',
      }))
    )

  await db
    .from('purchases')
    .update({ status: flagged.length ? 'awaiting_approval' : 'building' })
    .eq('id', purchaseId)
```

to:

```ts
  await db.from('approvals').delete().eq('purchase_id', purchaseId).eq('status', 'pending')
  const toInsert = [
    ...pending.map((f) => ({ ...f, status: 'pending' as const })),
    // 'always' verdict: record an approved row so there's an audit trail per run.
    ...autoApproved.map((f) => ({ ...f, status: 'approved' as const })),
  ]
  if (toInsert.length)
    await db.from('approvals').insert(
      toInsert.map((f) => ({
        purchase_id: purchaseId,
        purchase_item_id: f.itemId,
        approver_id: f.approverId,
        rule: f.rule,
        status: f.status,
      }))
    )

  await db
    .from('purchases')
    .update({ status: pending.length ? 'awaiting_approval' : 'building' })
    .eq('id', purchaseId)
```

- [ ] **Step 5: Keep subtotal + returned view correct**

After the purchases status update, before the return, add (recompute subtotal when items were dropped):

```ts
  if (dropItemIds.length) {
    const { data: kept } = await db
      .from('purchase_items')
      .select('qty, unit_price_cents')
      .eq('purchase_id', purchaseId)
    const subtotal = (kept ?? []).reduce((s, it) => s + it.unit_price_cents * it.qty, 0)
    await db.from('purchases').update({ subtotal_cents: subtotal }).eq('id', purchaseId)
  }
```

Then in the returned view, exclude dropped items and only flag still-pending lines. Change the final `return itemRows.map(...)` block:
- filter out dropped: `return itemRows.filter((it) => !dropSet.has(it.id)).map((it) => {`
- build `flagByItem` from `pending` instead of `flagged`: `const flagByItem = new Map(pending.map((f) => [f.itemId, f]))`

- [ ] **Step 6: Verify logic still typechecks and unit tests pass**

Run: `cd web && npx tsc --noEmit && npx vitest run lib/standing.test.ts lib/split.test.ts`
Expected: no type errors; all tests PASS. (End-to-end behavior is exercised by Task 4's route.)

- [ ] **Step 7: Commit**

```bash
git add web/lib/split-run.ts
git commit -m "feat: apply recurring-cart standing verdicts in runSplit"
```

---

### Task 4: Recurring cart API routes

**Files:**
- Create: `web/app/api/recurring/route.ts` (list + create)
- Create: `web/app/api/recurring/[id]/run/route.ts` (reorder → build + split)
- Create: `web/app/api/recurring/[id]/decision/route.ts` (upsert/clear a standing verdict)

**Interfaces:**
- Consumes: `admin()` from `@/lib/supabase`; `createBuildingPurchase`, `insertPurchaseItems` from `@/lib/agent-data`; `runSplit` from `@/lib/split-run`.
- Produces:
  - `GET /api/recurring?user=<id>` → `{ carts: [{ id, name, items, decision: 'always'|'ask'|'never' }] }`
  - `POST /api/recurring` `{ name, items:[{product_id,qty}], ownerId }` → `{ id }`
  - `POST /api/recurring/[id]/run` `{ userId }` → `{ purchaseId, lines }` (lines = `SplitLineView[]`)
  - `POST /api/recurring/[id]/decision` `{ approverId, decision: 'always'|'ask'|'never' }` → `{ ok, decision }`

- [ ] **Step 1: Read the routing docs**

Read `node_modules/next/dist/docs/` for the current route-handler + dynamic-segment (`params` is a Promise here — see existing `web/app/api/approval/[id]/route.ts`) conventions before writing.

- [ ] **Step 2: Write the list + create route**

Create `web/app/api/recurring/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'

// GET ?user=<id> — recurring carts for the household + this user's standing verdict on each.
export async function GET(req: Request) {
  const user = new URL(req.url).searchParams.get('user')
  if (!user) return NextResponse.json({ error: 'user required' }, { status: 400 })
  const db = admin()
  const { data: carts, error } = await db
    .from('recurring_carts')
    .select('id, name, items')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: decisions } = await db
    .from('recurring_cart_approvals')
    .select('recurring_cart_id, decision')
    .eq('approver_id', user)
  const byId = new Map((decisions ?? []).map((d) => [d.recurring_cart_id, d.decision]))
  return NextResponse.json({
    carts: (carts ?? []).map((c) => ({ ...c, decision: byId.get(c.id) ?? 'ask' })),
  })
}

// POST { name, items:[{product_id,qty}], ownerId } -> { id }
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { name?: string; items?: unknown; ownerId?: string }
    | null
  if (!body?.name || !Array.isArray(body.items))
    return NextResponse.json({ error: 'name and items required' }, { status: 400 })
  const db = admin()
  const { data: hh } = await db.from('households').select('id').limit(1).single()
  const { data, error } = await db
    .from('recurring_carts')
    .insert({
      name: body.name,
      items: body.items,
      owner_id: body.ownerId ?? null,
      household_id: hh?.id ?? null,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}
```

- [ ] **Step 3: Write the reorder (run) route**

Create `web/app/api/recurring/[id]/run/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'
import { createBuildingPurchase, insertPurchaseItems } from '@/lib/agent-data'
import { runSplit } from '@/lib/split-run'

// POST { userId } — rebuild a saved cart into a fresh purchase and split it.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { userId?: string }
  const db = admin()
  const { data: cart } = await db
    .from('recurring_carts')
    .select('id, name, items')
    .eq('id', id)
    .single()
  if (!cart) return NextResponse.json({ error: 'recurring cart not found' }, { status: 404 })

  const purchaseId = await createBuildingPurchase({
    createdBy: body.userId ?? 'seed-user',
    note: JSON.stringify({ text: `Reorder: ${cart.name}`, skipped: [] }),
  })
  await db.from('purchases').update({ recurring_cart_id: id }).eq('id', purchaseId)
  await insertPurchaseItems(purchaseId, cart.items as { product_id: string; qty: number }[])
  const lines = await runSplit(purchaseId)
  return NextResponse.json({ purchaseId, lines })
}
```

- [ ] **Step 4: Write the decision route**

Create `web/app/api/recurring/[id]/decision/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase'

// POST { approverId, decision: 'always'|'ask'|'never' }.
// 'ask' clears the row (absence = ask); 'always'|'never' upsert it.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => null)) as
    | { approverId?: string; decision?: string }
    | null
  if (!body?.approverId || !['always', 'ask', 'never'].includes(body.decision ?? ''))
    return NextResponse.json(
      { error: 'approverId and decision(always|ask|never) required' },
      { status: 400 },
    )
  const db = admin()
  if (body.decision === 'ask') {
    await db
      .from('recurring_cart_approvals')
      .delete()
      .eq('recurring_cart_id', id)
      .eq('approver_id', body.approverId)
    return NextResponse.json({ ok: true, decision: 'ask' })
  }
  const { error } = await db.from('recurring_cart_approvals').upsert(
    {
      recurring_cart_id: id,
      approver_id: body.approverId,
      decision: body.decision,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'recurring_cart_id,approver_id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, decision: body.decision })
}
```

- [ ] **Step 5: Verify end-to-end (this proves Task 3 too)**

Run `cd web && npm run dev`. In another shell, with a real seeded approver id (query one: `select id from users limit 1;`) and the recurring cart id (`select id from recurring_carts;`):

```bash
# ask (default): reorder flags an approver -> pending
curl -sX POST localhost:3000/api/recurring/<CART_ID>/run -H 'content-type: application/json' -d '{"userId":"<USER_ID>"}' | jq '.lines[] | select(.flag)'
# set always, reorder again -> no flag on that line, an approved approval row exists
curl -sX POST localhost:3000/api/recurring/<CART_ID>/decision -H 'content-type: application/json' -d '{"approverId":"<APPROVER_ID>","decision":"always"}'
curl -sX POST localhost:3000/api/recurring/<CART_ID>/run -H 'content-type: application/json' -d '{"userId":"<USER_ID>"}' | jq '.lines[] | select(.flag)'   # expect empty
# set never, reorder -> the flagged line is gone from .lines
curl -sX POST localhost:3000/api/recurring/<CART_ID>/decision -H 'content-type: application/json' -d '{"approverId":"<APPROVER_ID>","decision":"never"}'
```

Expected: `always` run returns no flagged line (verify `select status from approvals where purchase_id=... ` shows `approved`); `never` run omits that item entirely. If the seeded cart never flags anyone, temporarily lower the approver's `approval_threshold` policy or raise a product qty so a line exceeds it.

- [ ] **Step 6: Commit**

```bash
git add web/app/api/recurring
git commit -m "feat: recurring cart routes — list, create, reorder, standing decision"
```

---

### Task 5: Inline standing control on the approval device

**Files:**
- Modify: `web/app/api/approvals/route.ts` (add `recurringCartId` + `recurringCartName` to each pending item)
- Modify: `web/components/RealtimeProvider.tsx` (extend the `Pending` type)
- Modify: `web/app/approve/view.tsx` (render the control + write the verdict on decide)

**Interfaces:**
- Consumes: `POST /api/recurring/[id]/decision`.
- Produces: `Pending` gains `recurringCartId?: string` and `recurringCartName?: string`.

- [ ] **Step 1: Return the recurring link from the approvals route**

In `web/app/api/approvals/route.ts`, extend the select to join the purchase's recurring cart:

```ts
    .select('id, purchase_id, purchase_item_id, approver_id, rule, purchase_items(name, unit_price_cents, qty), purchases(recurring_cart_id, recurring_carts(name))')
```

In the `.map`, after computing `item`, resolve the purchase relation the same defensive way and add two fields to the returned object:

```ts
    const purchase = (Array.isArray(a.purchases) ? a.purchases[0] : a.purchases) as
      | { recurring_cart_id: string | null; recurring_carts: { name: string } | { name: string }[] | null }
      | null
    const rc = purchase
      ? (Array.isArray(purchase.recurring_carts) ? purchase.recurring_carts[0] : purchase.recurring_carts)
      : null
    return {
      // ...existing fields...
      recurringCartId: purchase?.recurring_cart_id ?? undefined,
      recurringCartName: rc?.name ?? undefined,
    }
```

- [ ] **Step 2: Extend the `Pending` type**

In `web/components/RealtimeProvider.tsx`, add to the `Pending` type:

```ts
  recurringCartId?: string;
  recurringCartName?: string;
```

- [ ] **Step 3: Render the control and write the verdict**

In `web/app/approve/view.tsx` `Device()`, add state:

```ts
  const [standing, setStanding] = useState<'always' | 'ask' | 'never'>('ask');
```

In `decide`, after the existing `POST /api/approval/${latest.id}` call, before `refresh()`, persist the standing verdict when the approval belongs to a recurring cart and the approver changed it from the default:

```ts
      if (latest.recurringCartId && standing !== 'ask') {
        try {
          await fetch(`/api/recurring/${latest.recurringCartId}/decision`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ approverId: latest.approverId, decision: standing }),
          });
        } catch {}
      }
```

Render a three-way control just above `<ApprovalCard .../>`, only for recurring approvals:

```tsx
      {latest?.recurringCartId && (
        <div className="px-6 pb-1 text-[13px] font-medium text-ink-soft">
          <p className="mb-1.5">For <span className="font-semibold text-ink">{latest.recurringCartName}</span> next time:</p>
          <div className="flex gap-2">
            {(['always', 'ask', 'never'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setStanding(opt)}
                className={`press flex-1 rounded-xl border py-2 text-[13px] font-semibold capitalize ${
                  standing === opt ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-ink-soft'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
```

Note: `latest.approverId` is already on the `Pending` shape returned by the approvals route.

- [ ] **Step 4: Verify**

Run `cd web && npx tsc --noEmit` (expect clean), then `npm run dev`, reorder a recurring cart that flags the approver (Task 4 Step 5), open `/approve/<approverId>`, confirm the "For Weekly groceries next time: always | ask | never" control shows, pick `always`, approve, then reorder again and confirm no prompt (the line is auto-approved).

- [ ] **Step 5: Commit**

```bash
git add web/app/api/approvals/route.ts web/components/RealtimeProvider.tsx web/app/approve/view.tsx
git commit -m "feat: inline standing-verdict control on approval device"
```

---

### Task 6: Recurring carts section in settings (edit + reorder)

**Files:**
- Modify: `web/app/settings/page.tsx`

**Interfaces:**
- Consumes: `GET /api/recurring?user=`, `POST /api/recurring/[id]/decision`, `POST /api/recurring/[id]/run`; `useMe` from `@/lib/useMe`.

- [ ] **Step 1: Load recurring carts**

In `web/app/settings/page.tsx`, add state and a fetch (follow the file's existing client-component + `useMe` pattern):

```tsx
  const [carts, setCarts] = useState<{ id: string; name: string; decision: 'always' | 'ask' | 'never' }[]>([]);
  useEffect(() => {
    if (!me) return;
    fetch(`/api/recurring?user=${encodeURIComponent(me)}`)
      .then((r) => (r.ok ? r.json() : { carts: [] }))
      .then((j) => setCarts(j.carts ?? []))
      .catch(() => {});
  }, [me]);
```

- [ ] **Step 2: Render the section**

Add a "Recurring carts" section listing each cart with a three-way control and a Reorder button:

```tsx
  const setDecision = async (id: string, decision: 'always' | 'ask' | 'never') => {
    setCarts((cs) => cs.map((c) => (c.id === id ? { ...c, decision } : c)));
    await fetch(`/api/recurring/${id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approverId: me, decision }),
    }).catch(() => {});
  };
  const reorder = async (id: string) => {
    const r = await fetch(`/api/recurring/${id}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: me }),
    });
    if (r.ok) window.location.href = '/cart';
  };
```

```tsx
      <section className="space-y-3">
        <h2 className="font-display text-base font-bold text-ink">Recurring carts</h2>
        {carts.length === 0 && <p className="text-sm text-ink-soft">No recurring carts yet.</p>}
        {carts.map((c) => (
          <div key={c.id} className="rounded-2xl border border-line bg-surface p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-ink">{c.name}</span>
              <button onClick={() => reorder(c.id)} className="press text-[13px] font-semibold text-accent">Reorder</button>
            </div>
            <div className="flex gap-2">
              {(['always', 'ask', 'never'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setDecision(c.id, opt)}
                  className={`press flex-1 rounded-xl border py-2 text-[13px] font-semibold capitalize ${
                    c.decision === opt ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-ink-soft'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
```

- [ ] **Step 3: Verify**

Run `cd web && npx tsc --noEmit` (clean), `npm run dev`, open `/settings`: the "Recurring carts" section lists "Weekly groceries", the toggle reflects and persists (reload keeps it), and "Reorder" builds a purchase and lands on `/cart`.

- [ ] **Step 4: Commit**

```bash
git add web/app/settings/page.tsx
git commit -m "feat: recurring carts settings section — edit verdict + reorder"
```

---

## Self-Review Notes

- **Spec coverage:** data model → Task 1; standing logic → Task 2/3; reorder flow → Task 4; money-path safety (`never` visible via dropped line, `always` leaves an approved audit row) → Task 3 Steps 3–4; inline capture → Task 5; settings list → Task 6. All covered.
- **Type consistency:** `FlagEntry`/`StandingMap` defined in Task 2, consumed in Task 3; `decision` union `'always'|'ask'|'never'` consistent across routes and both UIs; `Pending.recurringCartId/Name` defined in Task 5 Step 2, consumed Step 3.
- **Deferred (per spec non-goals):** no scheduler; no per-cart $ ceiling. Not in scope.

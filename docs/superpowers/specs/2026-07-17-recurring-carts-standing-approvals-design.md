# Recurring carts + standing approvals — design

**Date:** 2026-07-17
**Status:** approved, ready for planning

## Problem

Today every flagged line makes an approver tap approve/decline **each time**
(`POST /api/approval/[id]`). For carts the household re-orders (weekly
groceries, dorm supplies), that prompt repeats identically forever. The
approver wants a *standing* verdict per recurring cart:

- **always** — auto-approve every recurrence, no prompt
- **ask** — prompt each time (today's behavior, the default)
- **never** — auto-decline every recurrence, visibly

This is the "don't ask me again for this" permission pattern, applied to money.

## Non-goals (v1)

- **No scheduler.** "Recurring" = a saved, named cart with a manual **Reorder**
  button. Auto-firing on a cron is a separate, later feature. The
  always/ask/never value lands the instant you reorder.
- **No per-cart $ ceiling** ("always, but re-ask above $X"). Natural next knob;
  YAGNI for v1. Audit trail + revoke cover the risk. Add when felt.

## Data model

Two tables + one column. Migration `0002_recurring_carts.sql`, matching the
`gen_random_uuid()` / `timestamptz default now()` conventions in `0001_init.sql`.

```sql
create table recurring_carts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references users(id),
  household_id uuid references households(id),
  name text not null,
  items jsonb not null,              -- [{ product_id, qty }] — same shape the builder emits
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

**"ask" is the absence of a row.** No migration of existing behavior, no
default rows to seed. Only `always` / `never` are ever persisted.

## Re-run flow

`POST /api/recurring/[id]/run`:

1. Load the recurring cart. Insert a `purchases` row with
   `recurring_cart_id = [id]`, then insert `purchase_items` from `items`
   (resolve `product_id` → name/price/category from `products`, same as the
   normal build path).
2. Call `runSplit(purchaseId)` — unchanged except for one new branch.

**The one new branch, inside `runSplit`** (`web/lib/split-run.ts`): when the
split engine flags approver A on a line, before writing a **pending** approval
row, look up `recurring_cart_approvals` for `(purchase.recurring_cart_id, A)`:

| standing decision | what runSplit does |
|---|---|
| `always` | write the approval row as `approved` (no prompt, purchase stays checkout-ready) |
| `never`  | drop the line via the existing decline path (delete item → cascades splits + approval), record reason `"standing rule"` |
| none / `ask` | write a `pending` approval row — exactly as today |

`runSplit` already loads the purchase; it just also reads `recurring_cart_id`
and, if set, the approver's standing rows. A normal (non-recurring) purchase
has `recurring_cart_id = null` → zero behavior change.

## Surfaces

### Inline capture (approver's device)
When a flagged purchase has a non-null `recurring_cart_id`, the approve/decline
UI gains one optional control alongside the existing buttons:

```
⚠ Weekly groceries needs approval ($64)
  [ Decline ]   [ Approve ]
  ○ always approve this cart   ○ always decline   ● just this time
```

On submit, if a standing option is chosen, `upsert recurring_cart_approvals
(recurring_cart_id, approver_id, decision)`. "just this time" writes nothing.
The approve/decline of the *current* line still goes through
`POST /api/approval/[id]` as today; the standing write is additive.

### Settings list
`/settings` gains a **Recurring carts** section: one row per recurring cart the
user approves for, each a segmented `always | ask | never` control. Changing it
upserts (or deletes, for `ask`) `recurring_cart_approvals`. This edits/revokes
whatever inline capture wrote.

## Money-path safety (kept deliberately)

- **`never` is visible, not silent.** The dropped line surfaces to the
  requester with reason `"standing rule"`, same UI as a manual decline. A
  requester is never left wondering why an item vanished.
- **`always` still records an `approved` approval row every run** → full audit
  trail per recurrence, and the rule is revocable any time in settings. No
  money moves without a row naming who authorized it.

## Files touched (estimate)

- `web/supabase/migrations/0002_recurring_carts.sql` — new
- `web/lib/split-run.ts` — the one standing-decision branch
- `web/app/api/recurring/[id]/run/route.ts` — new (build-from-template + split)
- `web/app/api/recurring/route.ts` — new (list/create recurring carts, list standing decisions)
- Approver UI component — add the inline standing control
- `web/app/settings/page.tsx` — add the Recurring carts section

## Test seam

One check that fails if the branch breaks: given a recurring cart with an
`always` row for approver A and a line that flags A, `runSplit` produces an
`approved` approval row and a checkout-ready purchase (no `pending`). Mirror for
`never` (line dropped) and no-row (`pending`, unchanged).

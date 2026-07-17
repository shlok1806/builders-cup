# Cartel — P4: Payments + Demo

**You own:** Stripe sandbox (customers/PMs), the multi-card checkout, the charges ledger, the savings summary — and **the demo itself** (rehearsal + fallback recording). Your job is that it doesn't break on stage. Features **F6, F8, demo.**
**Full spec:** `architecture.md` §7. **Master plan:** `docs/superpowers/plans/2026-07-17-cartel.md`.

## Your global constraints
- **Stripe Payments only** (Customers + PaymentIntents). **No Issuing.**
- **$0 users get no charge** — Stripe rejects `amount: 0`. Skip them.
- **Idempotent checkout:** guard on `purchases.status !== 'charged'`; idempotency key per (purchase, user, **amount**) — `${purchaseId}:${userId}:${amountCents}`. A rehearsal double-click must never double-charge; the amount in the key keeps a post-decline re-split from colliding with a stale key (Stripe errors if a key is reused with different params).
- A failing PI writes a `failed` charge row **gracefully** — never crash the flow.
- Integer cents; currency `usd`.

## Interfaces you consume
- Seeded `payment_methods` (`stripe_customer_id`, `stripe_pm_id`) — Phase 0 seed.
- `item_splits` per user — written by P3's split route.
- `admin()` server client (`lib/supabase.ts`, Phase 0).

## Interfaces you produce
```ts
// lib/stripe.ts
chargeUser(customerId:string, pmId:string, amountCents:number, idempotencyKey:string):
  Promise<{ piId:string|null, status:'succeeded'|'failed' }>
```
- `POST /api/purchase/[id]/checkout → { charges:[{userId,amountCents,status}] }`
- `GET /api/purchase/[id]/summary → { savedCents, stepsCollapsed }`

## Phase 0 (you own the Stripe part of Task 0.3 seed)
For each of the 4 users: `stripe.customers.create()` → `stripe.paymentMethods.attach('pm_card_visa', {customer})` → set default → store `stripe_customer_id` + `stripe_pm_id` + `last4`/`brand` in `payment_methods`. Coordinate with P3 who owns the rest of the seed. Also join Task 0.4 (lock demo numbers).

---

## Task P4.1: Stripe helper + single PaymentIntent proof
**Files:** Create `lib/stripe.ts`
- [ ] Create the Stripe client. `chargeUser` → `paymentIntents.create({ amount, currency:'usd', customer, payment_method, off_session:true, confirm:true }, { idempotencyKey })`; return `{ id, status }`; catch card errors → `{ piId:null, status:'failed' }`.
- [ ] Prove it: throwaway script charges one seeded customer $5 on `pm_card_visa` → `succeeded`. Delete the script.
- [ ] Commit: `git commit -m "feat: stripe helper + confirmed PaymentIntent"`

## Task P4.2: Multi-card checkout route — F6 (the money shot)
**Files:** Create `app/api/purchase/[id]/checkout/route.ts`
- [ ] Guard: if `status === 'charged'`, return existing charges (no re-charge). If any `approvals` still `pending`, 409.
- [ ] Aggregate `item_splits` per user → `amountCents`. **Skip any user with `amountCents === 0`.**
- [ ] For each remaining user: look up PM, `chargeUser(..., idempotencyKey=`${purchaseId}:${userId}:${amountCents}`)`, write a `charges` row with PI id + status.
- [ ] If all `succeeded`, set `purchases.status = 'charged'`; else surface `failed` rows (don't crash). Return charges.
- [ ] Verify: run P3's split on the seeded cart, then checkout → 3–4 `succeeded` charges summing to subtotal, no $0 charge.
- [ ] Commit: `git commit -m "feat: multi-card checkout — N PaymentIntents + charges ledger"`

## Task P4.3: Savings summary — F8
**Files:** Create `app/api/purchase/[id]/summary/route.ts`
- [ ] Persist the `skipped` list from the build step (store as JSON on `purchases.note` or a column) so summary can sum skipped prices. `savedCents = Σ price of skipped items`; `stepsCollapsed` = fixed narrative integer.
- [ ] Commit: `git commit -m "feat: savings summary (dedupe $ saved)"`

## Task P4.4: Rehearsal + fallbacks — YOU OWN THE DEMO
- [ ] Record the checkout money-shot as a fallback video.
- [ ] With P2: verify cached-LLM fallbacks fire for the two exact demo prompts (network unplugged).
- [ ] With P1/P3: rehearse the two-device approval handoff on a phone hotspot; approver screen (`/approve?user=<sam>`) open before the beat.
- [ ] Run the full 7-beat demo 5+ times. **Enforce the hour-6 feature freeze** — after rehearsal starts, no new code.

## Integration gates you're on
- **I4:** your checkout fires N PIs → P1's cards animate to "charged" → P3's dashboard + your savings update.
- You are the backstop for **all** gates — if the flow breaks anywhere, it breaks your demo. Rehearse the whole chain, not just checkout.

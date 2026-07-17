# Cartel — Product Architecture

**Working name:** Cartel (pun on cart; rename freely)
**One-liner:** Ramp for a shared cart. Describe what the house needs, the agent builds the cart, we split it line-by-line by each person's rules, and charge everyone their exact share at checkout. Nobody is ever owed anything.

**Event:** Builders Cup by Ramp, one-day NYC hackathon. Theme: save money, save time.

---

## 1. What we're actually building

Splitwise is a passive ledger. It records who owes what and leaves you to chase people and argue over what's fair. We do the two things it structurally can't:

1. **Collect automatically.** At checkout each roommate's own card is charged for their share, instantly. The debt exists for a millisecond, then clears. No pool, no pre-funding, no reminder texts.
2. **Enforce personal spend rules.** Everyone sets rules once ("never split alcohol to me", "cap me at $50/week", "anything over $40 needs my approval"). The system applies them at split time so nobody argues at checkout.

Plus an agent that builds the cart from plain English so nobody does the shopping busywork, and a Ramp-style dashboard that categorizes spend and flags waste.

**Pitch headline:** instant multi-card collection (the payoff everyone feels).
**Real engineering muscle:** the agentic cart builder and the policy split (the differentiators judges can't dismiss).

---

## 2. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Team | 4 people | Full scope realistic |
| Auth | None. Seeded users, dropdown switch, `?user=<id>` for the approval device | Auth is not the star; zero demo cost |
| Charge model | One Stripe PaymentIntent per roommate for their share | Real in sandbox, no harder than mock, better money-shot |
| Money movement | Stripe **Payments** (Customers + PaymentIntents). **No card issuing.** | Charge-routing, not a shared card. Simpler |
| Vendor | Single, seeded catalog | Kills scraping fragility; time-save still lands |
| DB / realtime | Supabase (Postgres + Realtime) | Realtime powers the live approval beat |
| Agent | OpenAI API, two calls only | Cart builder + policy compiler |
| Split engine | Deterministic code, not the LLM | Splitting is math once rules are compiled; reliable |

**Out of scope, say it if asked:** real auth, ACH/bank funding, card issuing, multi-vendor, live web scraping, real external merchant checkout, mobile native, RLS/security hardening, refunds/disputes/partial-auth edge cases, vendor payout (we build the collection side; paying the merchant is mocked).

---

## 3. System architecture

```
┌─────────────────────────────────────────────────────────┐
│  Next.js (App Router)                                     │
│  - UI: cart, split view, policies, approval, dashboard   │
│  - API routes = the backend                              │
└───────────────┬─────────────────────────┬───────────────┘
                │                          │
        ┌───────▼────────┐        ┌────────▼─────────┐
        │  OpenAI API    │        │  Stripe (sandbox)│
        │  - cart builder│        │  - Customers     │
        │  - policy      │        │  - PaymentMethods│
        │    compiler    │        │  - PaymentIntents│
        └───────┬────────┘        └────────┬─────────┘
                │                          │
        ┌───────▼──────────────────────────▼───────────────┐
        │  Supabase (Postgres + Realtime)                   │
        │  households, users, payment_methods, policies,    │
        │  products, purchases, purchase_items, item_splits,│
        │  charges, approvals                               │
        └───────────────────────────────────────────────────┘
```

**The one flow everything serves:** describe → agent builds cart → deterministic split applies compiled policies → any flagged line needs approval (realtime) → checkout fires N PaymentIntents → dashboard updates.

The LLM appears in exactly two places: turning free text into a cart, and turning a rule sentence into structured policy. Everything on the money path (splitting, thresholds, charging) is deterministic code. That's deliberate: the demo cannot hinge on a model behaving live.

---

## 4. Data model (Supabase / Postgres)

Skip RLS for the hackathon; it's a demo, not production. Everything is `uuid` PK with `created_at timestamptz default now()` unless noted.

**households** — the group
`id, name, monthly_budget_cents`

**users** — roommates (seeded, no auth)
`id, household_id → households, name, avatar_url, color`

**payment_methods** — each roommate's saved test card
`id, user_id → users, stripe_customer_id, stripe_pm_id, last4, brand`

**policies** — compiled personal rules (the "constitution")
`id, user_id → users, household_id, type, params jsonb, source_text`
`type ∈ { exclude_category, approval_threshold, split_weight }`
Examples of `params`:
- exclude_category → `{ "category": "alcohol" }`
- approval_threshold → `{ "amount_cents": 4000 }` (compared against the line total, `unit_price_cents × qty`)
- split_weight → `{ "weight": 2 }`
`source_text` keeps the original sentence so the UI can show "compiled from: ...".

**products** — seeded single-vendor catalog
`id, name, category, vendor, price_cents, unit, image_url`
Categories matter (they drive policy matching): groceries, alcohol, cleaning, meat, snacks, household.

**purchases** — a cart/order
`id, household_id, status, subtotal_cents, note, created_by → users`
`status ∈ { building, awaiting_approval, charged, failed }`

**purchase_items** — line items
`id, purchase_id → purchases, product_id → products, name, qty, unit_price_cents, category`

**item_splits** — who owes what per line (split engine output)
`id, purchase_item_id → purchase_items, user_id → users, amount_cents`

**charges** — the per-roommate PaymentIntent
`id, purchase_id → purchases, user_id → users, amount_cents, stripe_payment_intent_id, status`
`status ∈ { pending, succeeded, failed }`

**approvals** — approval requests (drives the realtime beat)
`id, purchase_id → purchases, purchase_item_id → purchase_items, approver_id → users, rule, status`
`status ∈ { pending, approved, declined }`

**Dedupe source:** query recent `purchase_items` joined to `purchases` for the household in the last N days; feed those names to the cart builder so it skips what's already bought.

---

## 5. Feature breakdown

Each feature: what it does, the UX, the data it touches, whether the LLM is involved, the owner, and the reliability note.

### F1 — Household shell + roommate switcher + wallet/dashboard frame
**Does:** the container. Seeded household, 4 roommates with avatars/colors, a dropdown to switch "who am I", the dashboard shell the demo opens on.
**UX:** top bar with household name + user switcher. Landing = dashboard (F7).
**Data:** `households`, `users`.
**LLM:** no.
**Owner:** P1 (frontend).
**Reliability:** pure seeded read. Pre-load one prior purchase so the app never opens empty.

### F2 — Agentic cart builder (REAL, differentiator)
**Does:** free text → a categorized cart from the seeded catalog, deduped against recent house purchases.
**UX:** a single input ("restock the apartment and snacks for Friday"). Agent streams back a cart; skipped items shown with a reason ("skipped paper towels — bought Tuesday").
**Data:** reads `products` + recent `purchase_items`; writes `purchases` (building) + `purchase_items`.
**LLM:** yes — OpenAI call A (§6).
**Owner:** P2 (agent).
**Reliability:** constrain output to catalog `product_id`s so it can't invent products. JSON mode + validation. Cache a known-good response for the exact demo prompt as fallback.

### F3 — Policy compiler / the constitution (REAL, differentiator)
**Does:** each roommate writes rules in plain English; the LLM compiles each into a structured `policies` row.
**UX:** per-user settings panel. Type a rule → it appears as a compiled chip ("Alcohol: never charged to me"). 3-4 rules pre-seeded, type one live in the demo.
**Data:** writes `policies`.
**LLM:** yes — OpenAI call B (§6). Runs at rule-creation time, not on the money path.
**Owner:** P2 (agent).
**Reliability:** strict JSON schema, validate before insert, re-ask on malformed. Cache a good compile for the live-typed rule.

### F4 — Policy split engine (REAL, the core differentiator)
**Does:** takes the cart + everyone's compiled policies and computes per-line allocations. Deterministic. Canonical spec in §12.
**Logic (per line):**
1. Start with all household members on the line.
2. `exclude_category` → drop matching users. **If that empties the line, put everyone back** — an exclusion can't zero out a real cost (§12).
3. `split_weight` → weight the *surviving* members' shares (exclusions apply first, then weights).
4. Allocate by largest-remainder rounding so per-line cents sum exactly to the line total (§12).
5. Flag the line if its total (`unit_price_cents × qty`) hits any surviving user's `approval_threshold`. First matching rule owns the approval (§12).
**UX:** the split view — every line shows who's paying and how much; policy effects are visibly annotated ("alcohol excluded for Priya", "flagged: over Sam's $40 threshold").
**Data:** reads `purchase_items` + `policies`; writes `item_splits`; creates `approvals` for flagged lines.
**LLM:** no. This is code, on purpose.
**Owner:** P3 (backend).
**Reliability:** pure function over data. Unit-test against the canonical seed cart in §12 so per-user totals always reconcile to the subtotal.

### F5 — Multiparty approval (realtime)
**Does:** a flagged line pauses checkout until the responsible roommate approves.
**UX:** approver's device (phone via `?user=<id>`) gets a live card: "Approve $52 tequila?" → tap approve → checkout resumes. Decline → the line is removed from the purchase, the split re-runs without it, checkout continues (§12).
**Data:** `approvals`; Supabase Realtime channel on that table.
**LLM:** no.
**Owner:** P3 (backend) + P1 (approval UI).
**Reliability:** Supabase Realtime is primary (it's why we're on Supabase). **Setup gotcha:** the `approvals` table must be added to the realtime publication (`alter publication supabase_realtime add table approvals`) and the browser must subscribe with the anon key — verify a live event fires before hour 6. Keep a 1.5s polling fallback wired behind a flag in case venue wifi is flaky. Rehearse the two-device handoff on a phone hotspot. Approver screen open before the beat.

### F6 — Multi-card collection at checkout (REAL, pitch headline)
**Does:** on checkout, fire one PaymentIntent per roommate for their share, on their saved test card. All at once.
**UX:** a checkout button → four cards animate to "charged" with each amount. The money-shot.
**Data:** reads `item_splits` aggregated per user; writes `charges`; sets `purchases.status = charged`.
**LLM:** no.
**Owner:** P4 (payments).
**Reliability:** in sandbox, `off_session` PaymentIntents on `pm_card_visa` confirm instantly. Pre-create Customers + PMs in seed. **Skip any user whose aggregated share is $0** — no `charges` row, no PI (Stripe rejects `amount: 0`). Guard checkout on `status !== 'charged'` and pass a Stripe idempotency key per (purchase, user) so a rehearsal double-click never double-charges. If a PI errors live, the charges row shows `failed` gracefully rather than crashing the flow. Rehearse.

### F7 — Dashboard / auto-categorization / house statement (Ramp twist)
**Does:** the Ramp-style view. Monthly spend by category, each roommate's real share across all purchases, overspend flag vs `households.monthly_budget_cents`.
**UX:** the landing screen. Category breakdown, per-person totals, a "this month" number.
**Data:** aggregates `purchase_items` + `item_splits` for the household, filtered by **`purchases.created_at`** (this month) — **not** `item_splits.created_at`, which is stamped at split time (today) and would hide backdated prior purchases. Seed must backdate `purchases.created_at`.
**LLM:** no (categories come from `products.category`).
**Owner:** P1 (frontend) + P3 (queries).
**Reliability:** aggregation over seeded + demo data. Deterministic. **Seed purchases with explicit backdated `created_at` spread across the month** — otherwise everything clusters on today and the monthly view looks empty.

### F8 — Savings + time summary card
**Does:** the closing proof. "$X saved this cart, N manual steps collapsed to 1."
**UX:** appears after checkout.
**Data:** `$X = Σ prices of skipped (deduped) items`; the step count is the fixed narrative number (build → split → chase × N → settle, collapsed to one checkout).
**Owner:** P4 (owns the demo narrative) or P1.
**Reliability:** math over the finished cart. One named number, no hand-waving.

---

## 6. The two OpenAI calls

Only two. Both return strict JSON, both validated before use, both have a cached fallback for the exact demo input. Use OpenAI structured outputs (a `json_schema` response format) rather than plain `json_object` mode — it enforces your exact shape, so you can hand the schemas below to the API directly and rarely need the re-ask path.

### Call A — Cart builder
**Input:** user's free text + the catalog as `[{id, name, category}]` + recent purchase names for dedupe.
**System prompt shape:** "You build a shopping cart from a fixed catalog. Only use the provided product IDs. Skip anything in the recent-purchases list and explain why. Return only JSON."
**Output schema:**
```json
{
  "items": [{ "product_id": "uuid", "qty": 2 }],
  "skipped": [{ "name": "paper towels", "reason": "bought Tuesday" }]
}
```
Reject any `product_id` not in the catalog; re-ask once.

### Call B — Policy compiler
**Input:** one rule sentence from a roommate.
**System prompt shape:** "Compile a household spending rule into one JSON policy object. Choose exactly one type from the enum. Return only JSON."
**Output schema:**
```json
{
  "type": "exclude_category",
  "params": { "category": "alcohol" }
}
```
Enum: `exclude_category | approval_threshold | split_weight`. Validate `type` and `params` before insert.

---

## 7. Stripe sandbox integration (Payments, not Issuing)

- Activate an Issuing-free **Payments** sandbox. No sales call.
- **Seed:** for each roommate create a Stripe **Customer** and attach a test **PaymentMethod** (`pm_card_visa`). Store `stripe_customer_id` + `stripe_pm_id` in `payment_methods`.
- **Checkout:** aggregate `item_splits` per user → for each, create + confirm a **PaymentIntent** (`amount`, `currency:usd`, `customer`, `payment_method`, `off_session:true`, `confirm:true`). Sandbox confirms instantly.
- **Record:** write a `charges` row per user with the PI id + status.
- **What's real:** the collection side — N cards charged their exact share, live, in sandbox. Genuinely real, not mocked.
- **What's mocked:** paying the vendor (no real merchant), and funding/deposits. Say so plainly if asked; judges punish overclaiming, not honest scoping.

---

## 8. Team split (4)

| Person | Owns | Features |
|---|---|---|
| **P1 — Frontend/UX** | App shell, cart view, split view, dashboard, approval UI, polish | F1, F5 (UI), F7 (UI), F8, design |
| **P2 — Agent** | Both OpenAI calls, prompts, JSON validation, dedupe | F2, F3 |
| **P3 — Backend/Data** | Supabase schema, seed, split engine, approval logic, realtime, dashboard queries | F4, F5 (logic), F7 (queries) |
| **P4 — Payments + Demo** | Stripe sandbox, customers/PMs, multi-PI checkout, charges ledger, **owns rehearsal + fallback recording** | F6, F8, demo |

P4 owning the demo matters: their job is that it doesn't break on stage.

---

## 9. Build order + time boxes (~8-9h)

**0–0.5h — Scaffold.** Next.js repo, Supabase project, run schema migration, seed catalog + 4 roommates + Stripe customers/PMs + one prior purchase. Whole team agrees the 7 demo beats.

**0.5–2.5h — Parallel spines.**
- P1: app shell + cart view + split view on seed data.
- P2: cart builder call returning valid JSON against the catalog.
- P3: split engine + policy schema, unit-tested on the seed cart.
- P4: Stripe customers/PMs confirmed, one PaymentIntent working end to end.

**2.5–4.5h — Integrate.** cart builder → cart → split engine → split view. Policy compiler wired. P4: multi-PI checkout firing N charges.

**4.5–6h — The differentiators + close.** Approval flow + Realtime. Dashboard. Savings summary. **Target feature freeze here.**

**6–7h — Reliability pass.** Pin seed determinism, build the cached-LLM fallbacks, record the checkout fallback video, first full rehearsal.

**7–8.5h — Rehearse + polish.** Run the demo 5+ times, polish design last, prep Q&A. Last 30 min: rehearse only, no new code.

---

## 10. Demo script (7 beats, ~3 min)

1. **(15s) Hook.** Dashboard open. "Four roommates. Splitwise logs who owes what and leaves you to chase it. We made it so nobody's ever owed."
2. **(30s) Constitution.** Show pre-set rules, type one live ("don't split alcohol to me"), it compiles to a chip. *Wow 1.*
3. **(40s) Cart builder.** Type "restock + snacks for Friday." Agent builds the cart, skips the paper towels Sam bought Tuesday. *Wow 2.*
4. **(30s) Policy split.** Split view: alcohol skips the non-drinker, meat skips the vegetarian, the $52 item trips Sam's $40 approval threshold and gets flagged. *Wow 3.*
5. **(25s) Approval.** Flagged line pings Sam's phone (it's *his* $40 rule), he approves live. *Wow 4.*
6. **(25s) Collection.** Checkout: four cards charged their exact share at once, real in sandbox. *Money shot.*
7. **(15s) Close.** Dashboard updates, categorized. Savings card: "$X saved, one click." "Splitwise logs the debt. We delete it."

---

## 11. Risks + fallbacks

| Risk | Mitigation |
|---|---|
| LLM returns bad JSON live | Validate + re-ask once; cached good response for the exact demo input |
| Realtime flaky on venue wifi | Polling fallback behind a flag; run approval on a phone hotspot |
| A PaymentIntent errors on stage | Charges row shows `failed` gracefully; flow continues; rehearsed |
| Split math doesn't reconcile | Unit test redistribution against the seed cart; totals must equal subtotal |
| Scope creep past hour 6 | Hard feature freeze; P4 enforces rehearsal time |
| Judge asks "what's real?" | Honest: collection + split + cart are real in sandbox; vendor payout + deposits mocked |

---

## 12. Resolved edge cases (split-engine spec — the P3 contract)

The deterministic money path, pinned. Write the F4 unit test against this section.

**Policy enum is exactly three:** `exclude_category | approval_threshold | split_weight`. `weekly_cap` and `pay_from` are cut — the first needed running-total tracking and self-approval with no clean demo beat; the second was undefined and every user has one card.

**Per-line allocation order:**
1. Members on the line = whole household.
2. Apply `exclude_category` (drop matching users). **Orphan rule:** if this drops *everyone*, restore the full household for that line — an exclusion may not zero out a real cost.
3. Apply `split_weight` to the survivors (exclusions first, then weights). Default weight = 1.
4. **Largest-remainder rounding:** each survivor's raw share = `line_total × weight / Σweights`. Floor each to whole cents, then hand the leftover cents (`line_total − Σfloors`) one at a time to the largest fractional remainders. Guarantees `Σ per-user cents == line_total` exactly, every line.
5. **Flagging:** if `line_total (unit_price_cents × qty)` ≥ any surviving user's `approval_threshold.amount_cents`, create one `approvals` row. **First matching rule (lowest user id order) owns the approval** — never two approvers on one line.

**Approval outcomes:**
- **Approve** → line stays, checkout proceeds.
- **Decline** → remove the line from the purchase, re-run the whole split, continue. (Declined item simply isn't bought.)
- Checkout is gated on: zero `approvals` still `pending`.

**Charge aggregation:**
- Per user, sum their `item_splits` across all surviving lines → one PaymentIntent.
- **Skip $0 users entirely** (no `charges` row, no PI — Stripe rejects `amount: 0`).
- Guard on `purchases.status !== 'charged'`; idempotency key per (purchase, user, **amount**) — e.g. `${purchaseId}:${userId}:${amountCents}`. Amount must be in the key: a decline re-splits and changes shares, and reusing a key with different params makes Stripe error.

**Canonical seed cart (the test fixture — define real numbers at seed time):** one alcohol line (non-drinker excluded), one meat line (vegetarian excluded), one line over $40 (trips an `approval_threshold`), one plain line. Assert: every line reconciles, per-user aggregate sums to `subtotal_cents`, exactly one approval is created, and no user nets a $0 charge in the happy path.

**`split_weight` is live (not just a type).** Seed Jordan a `split_weight {weight:2}` policy so he carries a double share — the split route folds it into `member.weight`, the engine already honors it, and the split view annotates it ("Jordan × 2"). Pick the plain line total as a multiple of 5 (e.g. $10.00 → Sam/Priya/Alex $2.00, Jordan $4.00) so weighted cents stay exact. The weight-1 unit-test fixture stays as-is for the exclusion/orphan/flag/reconcile assertions; add **one** dedicated weighted test case (`weight:2` on one member → shares in that ratio, still reconciles).

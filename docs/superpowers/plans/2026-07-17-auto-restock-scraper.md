
# Auto-Restock Deal Scraper — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Framing — Cartel is Ramp for roommates

Ramp is one loop: **company cards + programmatic spend controls + real-time visibility + an AI that finds savings and closes the books — every action gated by approval workflows.** Cartel is that exact loop where the "company" is a household and the "employees" are roommates.

| Ramp (corporate finance) | Cartel (roommate finance) | Component |
|---|---|---|
| Employee corporate cards | Each roommate's own card | `payment_methods`, multi-PI checkout |
| Programmatic spend **controls** | The "constitution" — per-person rules | `policies` + split engine |
| **Approval workflows** | Realtime approval beat | `approvals` |
| Real-time dashboard + auto-categorization | House dashboard | `/api/dashboard` |
| **Procurement / vendor price intelligence / savings** | **The deal scraper — cheapest vendor per item** | `offers`, `deals.bestOffer` |
| AP automation / bill pay | Auto multi-card collection | `/api/purchase/[id]/checkout` |
| **Agentic finance** (AI acts on spend, gated by policy) | **Auto-restock agent** — predicts, sources, drafts, routes for approval | `auto-restock`, `restock` |
| "Close the books, nobody chases receipts" | "Nobody's ever owed — debt cleared at the charge" | the thesis |

This plan adds the **procurement + savings arm** of that platform. It is not a special path: the agent *proposes*, and the same policy + approval fabric *disposes*. Pitch:

> "Ramp gives companies cards, spend controls, and an AI that finds savings and closes the books automatically. We built that for the four people who share a fridge. The agent watches what the house runs low on, sources it at the cheapest price across vendors, and drafts the cart — but it can't spend a dollar until the person whose rule it trips approves. Splitwise logs the debt; we delete it."

**Reversal note:** `ARCHITECTURE.md §2` cut "live web scraping" and "multi-vendor" to kill fragility. This plan re-adds them, so the core engineering job is **isolating that fragility** behind cached fallbacks — the same discipline `lib/openai.ts` uses for the LLM calls.

## Global Constraints

- **Approval is always the gate.** The autonomous agent NEVER charges a card without a human approving. Auto-runs always end at `awaiting_approval` — checkout only fires after a human tap. Hard invariant.
- **The agent respects spend controls.** Like a Ramp agent, the auto-restock run obeys `households.monthly_budget_cents`: if a drafted cart would exceed the month's remaining budget, it is flagged for approval rather than drafted silently. Per-category caps are a natural future `policy` type.
- **Money path stays deterministic and untouched.** `lib/split.ts`, `lib/split-run.ts`, and checkout do not change. The LLM picks *what* is needed; deterministic code picks the *cheapest in-stock offer*. **No LLM-asserted price ever reaches `offers`, the split engine, or a charge** — every number that touches money is fetched/verified deterministically.
- **Pricing source = structured shopping API (primary).** Use a product-search API (SerpAPI Google Shopping / Rainforest) as the deterministic multi-vendor price source: one call, real structured prices, cacheable. This is neither brittle HTML scraping nor an LLM guessing. One real HTML scraper adapter is optional garnish (the "it's genuinely live" demo moment). An LLM-web-tool is at most a *discovery* layer that proposes candidate URLs, each verified by a deterministic fetch before its price enters `offers`.
- **Live-on-build, cache-backed.** Try live at build time; on slowness/blocking fall back to cached offers keyed to the normalized demo prompt (mirror `FALLBACKS`).
- **Two dedupe layers, separate:** (1) *recency* — skip needs bought in the last N days (exists); (2) *cross-vendor* — map many listings → one canonical `products` row via `canonical_key` (new).
- **Integer cents, `usd`.** Live app is **`web/`** (split engine, seed, backend routes all live there). Root `app/` holds the payments helpers only.
- **Still a demo.** Reliability > depth. Seed a deterministic offers fixture + backdated restock subscriptions so items are "due" and prices are fixed on demo day.
- **Env (new):** `SERPAPI_KEY` (or `RAINFOREST_KEY`).

---

## Data model changes (migration `web/supabase/migrations/0002_scraper.sql`)

`products` stops being a single-vendor priced catalog and becomes the **canonical product** (one row per real-world item). Prices move to `offers`.

```sql
alter table products add column canonical_key text;      -- normalized name+size+unit
create unique index products_canonical_key_idx on products (canonical_key);

create table offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  vendor text not null,
  url text,
  price_cents int not null,
  unit text,
  in_stock boolean not null default true,
  scraped_at timestamptz default now(),
  raw jsonb
);
create index offers_product_idx on offers (product_id);
create index offers_best_idx on offers (product_id, in_stock, price_cents);

create table restock_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id),
  product_id uuid references products(id),
  cadence_days int not null,
  lead_days int not null default 2,
  last_purchased_at timestamptz,
  enabled boolean not null default true,
  created_at timestamptz default now()
);

create table scrape_runs (
  id uuid primary key default gen_random_uuid(),
  adapter text not null,
  query text,
  status text not null check (status in ('ok','partial','failed')),
  offer_count int not null default 0,
  started_at timestamptz default now(),
  finished_at timestamptz
);

alter table purchase_items add column offer_id uuid references offers(id);
```

**Best deal** = `min(price_cents) where in_stock` per `product_id` — deterministic, no LLM.

---

## File structure (all under `web/`)

```
web/lib/
  scrape/
    types.ts             RawOffer, Adapter interface: fetchOffers(query) => Promise<RawOffer[]>
    adapters/serpapi.ts  PRIMARY — shopping API adapter (reliable, multi-vendor)
    adapters/<site>.ts   OPTIONAL — one real HTML scraper (the "it's live" moment)
    index.ts             orchestrator: run adapters -> normalize -> dedupe -> upsert offers + scrape_runs
    fixtures.ts          cached offers keyed to normalized demo prompt (fallback)
  dedupe.ts              canonicalize(raw) -> product_id (cross-vendor)
  restock.ts             cadence model + dueItems(householdId, horizonDays)
  deals.ts               bestOffer(productId), savingsVsSecond(productId)
  auto-restock.ts        runAutoRestock(householdId) — drafts + splits, STOPS at awaiting_approval
  openai.ts    (change)  Call A returns needs [{name,category,qty}] + skipped, not product_ids
  types.ts     (change)  Offer, RestockSubscription, ScrapeRun row types
web/app/api/
  cart/build/route.ts    (new) needs -> getOffers -> bestOffer -> purchase_items(offer_id)
  auto-restock/route.ts  (new) POST trigger for runAutoRestock. Returns purchaseId, never charges.
  purchase/[id]/summary/route.ts (new/change) savings = sum(second-cheapest - chosen)
  dashboard/route.ts     (change) add running procurement-savings metric
```

Reuse `web/lib/split-run.ts`'s `runSplit(purchaseId)` (already returns `awaiting_approval` when flagged) everywhere the split runs.

---

## Phase 0 — Schema + types (BLOCKING)

### Task 0.1: Migration
- [ ] Write `web/supabase/migrations/0002_scraper.sql` (above). Apply it; verify the three new tables + `products.canonical_key` + `purchase_items.offer_id`.
- [ ] Commit: `feat: schema — offers, restock subscriptions, scrape runs`

### Task 0.2: Row types
- [ ] Add `OfferRow`, `RestockSubscriptionRow`, `ScrapeRunRow` to `web/lib/types.ts` (leave engine types untouched).
- [ ] Commit: `feat: offer/restock/scrape row types`

---

## Phase 1 — Scraper pipeline

### Task 1.1: Adapter interface + shopping-API adapter (PRIMARY)
- [ ] `scrape/types.ts`: `RawOffer = { vendor, title, url, priceCents, unit?, inStock, raw }`; `Adapter = { name; fetchOffers(query): Promise<RawOffer[]> }`.
- [ ] `scrape/adapters/serpapi.ts`: query the shopping API, map → `RawOffer[]`. Timeout ~4s; return `[]` on error (never throw into the request path).

### Task 1.2: Real HTML scraper adapter (OPTIONAL — demo "live" moment)
- [ ] `scrape/adapters/<site>.ts` for the chosen retailer (cheerio; Playwright only if JS-rendered). Same timeout/empty-on-error contract. Skip if time-constrained — the API adapter alone satisfies "best deal across vendors."

### Task 1.3: Orchestrator + fallback fixtures
- [ ] `scrape/index.ts`: `getOffers(query)` runs enabled adapters in parallel, normalizes, calls `dedupe.canonicalize()` per offer, upserts `offers`, writes a `scrape_runs` row. On zero live offers → `fixtures.getForQuery(normalize(query))`.
- [ ] `scrape/fixtures.ts`: cached offers for demo prompts, keyed on `text.trim().toLowerCase().replace(/\s+/g,' ')`.
- [ ] Commit: `feat: scraper pipeline (API adapter + orchestrator + cached fallback)`

---

## Phase 2 — Dedupe, deals, restock

### Task 2.1: Cross-vendor dedupe
- [ ] `dedupe.ts`: `canonicalKey(title, unit)` — deterministic normalization (lowercase, strip vendor noise, normalize size/unit). `canonicalize(raw) => product_id`: match existing `canonical_key`, else insert a new canonical product. Leave an LLM-assist seam but add no LLM call (demo-safe, off money path).
- [ ] Smoke: two vendor listings of the same item collapse to one `product_id`, two offers.

### Task 2.2: Best-deal selector
- [ ] `deals.ts`: `bestOffer(productId)` → cheapest `in_stock` offer; `savingsVsSecond(productId)` → `secondCheapest - chosen` (0 if <2 offers). Pure over `offers`.

### Task 2.3: Restock cadence model
- [ ] `restock.ts`: per product per household, mean interval between buys → cadence. `dueItems(householdId, horizonDays)`: items where `now >= last_purchased_at + cadence_days - lead_days` (seeded via `restock_subscriptions`; fall back to derived cadence).
- [ ] Smoke: seeded backdated coffee/paper towels show as due.
- [ ] Commit: `feat: dedupe + best-deal selector + restock cadence`

---

## Phase 3 — Rework cart build (Call A)

### Task 3.1: Call A returns needs, not product_ids
- [ ] `openai.ts`: Call A schema → `{ items: [{name, category, qty}], skipped: [{name, reason}] }`. Prompt: "extract shopping needs; skip anything in the recent-purchases list." No catalog passed. Update the demo-prompt `FALLBACKS` entry to the new shape.

### Task 3.2: Build route resolves needs → best offers
- [ ] `app/api/cart/build/route.ts`: for each need → `getOffers(name)` → `bestOffer(productId)` → insert `purchase_item` with `unit_price_cents = best.price_cents`, `offer_id = best.id`, `category`, `qty`. Keep recency dedupe.
- [ ] Compute `subtotal_cents`. Return purchaseId + items (vendor + url) + skipped + `dealsCompared` count.
- [ ] Smoke: demo prompt → items priced from cheapest offers, vendors shown, paper towels skipped.
- [ ] Commit: `feat: cart build via scraped best-deal offers`

---

## Phase 4 — Autonomous restock (approval-gated — the Ramp agent)

### Task 4.1: Auto-restock engine
- [ ] `auto-restock.ts`: `runAutoRestock(householdId)`:
  1. `dueItems()` → resolve each to `bestOffer()`.
  2. **Budget control:** if the drafted subtotal would push this month's household spend over `monthly_budget_cents`, mark the cart for approval (don't silently exceed).
  3. Create `purchases(status:'building', note:'auto-restock')` + `purchase_items(offer_id)`.
  4. `runSplit(purchaseId)` → creates `approvals` for flagged lines.
  5. **Force `awaiting_approval`** even if no line was individually flagged (create a whole-cart approval) so it can never checkout unattended. **Never call checkout here.** Return `{ purchaseId }`.
- [ ] `app/api/auto-restock/route.ts`: `POST { householdId }` → `runAutoRestock`. Returns the pending purchase; does not charge.

### Task 4.2: Schedule + approval beat
- [ ] Weekly trigger (a `/schedule` cron routine or `CronCreate`) POSTs `/api/auto-restock`. For the demo, a manual "Run weekly restock" button hitting the same route is the reliable path.
- [ ] Confirm the `awaiting_approval` cart surfaces on the approver's phone (existing realtime/poll), and approve → checkout works end to end.
- [ ] Commit: `feat: autonomous approval-gated restock run`

---

## Phase 5 — Savings + dashboard + UI + seed

### Task 5.1: Procurement savings as a Ramp-style metric (F7 + F8)
- [ ] `summary/route.ts`: per-cart `savedCents = Σ savingsVsSecond(line.product_id)` for chosen offers + (existing) skipped-item value. Narrative: "compared N vendors, took the cheapest, saved $X."
- [ ] `dashboard/route.ts`: add a **running** `agentSavedThisMonthCents` (sum of per-line best-vs-second across the month's purchases) beside category spend + budget — Ramp's "we saved you money" headline.
- [ ] Commit: `feat: procurement savings metric (cart + running dashboard)`

### Task 5.2: Deals + agent UI
- [ ] Cart/split view: per line show vendor + "cheapest of N" chip, runner-up price struck through. Badge auto-restock carts "Auto-restock — due this week." Show `agentSavedThisMonthCents` on the dashboard.

### Task 5.3: Seed
- [ ] `seed.ts`: canonical `products` with `canonical_key`; multiple `offers` per product (so "cheapest of N" is real, savings > 0); `restock_subscriptions` with backdated `last_purchased_at` so coffee + paper towels are due; `fixtures.ts` entries for the demo prompt.
- [ ] Commit: `feat: seed offers + restock subscriptions + fixtures`

---

## Demo beat (new)

*"It's Monday. The house is about to run out of coffee and paper towels. The agent scanned N vendors, took the cheapest source for each, and drafted the cart — but it's asking Sam to approve the one item over his $40 rule before any card is touched."* Sam approves on his phone → four cards charged their exact share → savings card: "compared N stores, saved $X, nobody was ever owed."

---

## Open questions (defaults chosen; confirm to change)

- **Real HTML scraper target site** — Amazon / Instacart / Target. Default: ship the API adapter first; add one real scraper only if time allows, purely for the live moment.
- **Cross-vendor dedupe** — deterministic normalization (chosen, demo-safe) vs. LLM canonicalizer (adds a 3rd LLM call, off money path). Default deterministic; LLM seam left open.
- **Auto-run approval shape** — reuse per-line flagging but force the auto-cart to `awaiting_approval` (chosen), so unattended checkout is structurally impossible. **No unattended charge** is locked either way.

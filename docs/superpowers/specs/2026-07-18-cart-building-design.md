# Cart Building — Design Reference

**Status:** implemented on `main` (2026-07-18)
**Scope:** how a cart goes from an intent (typed request or "what's running low") to a
priced, splittable set of `purchase_items`.
**Related:** [ARCHITECTURE.md](../../../ARCHITECTURE.md) (product), the split engine (§12 there),
the scraper (`web/lib/scrape/`).

---

## 1. The one invariant everything else serves

> **The LLM never produces, asserts, or mutates a price. Prices come only from the
> scraper (deterministic), flow to the LLM as read-only context, and deterministic
> code does all final pricing.**

The LLM's job is **language and judgment**: turn fuzzy human intent into a structured
list, and — given real sourced facts — decide *what* to buy, *how many*, and *what to
skip*. Nothing that touches money is probabilistic. If the model hallucinated a number,
there is nowhere for it to land: no code reads a price off the model's output.

This is why every LLM call in the pipeline has a deterministic fallback — if the API (or
the key) is gone, the pipeline still runs, because the model was never on the money path.

---

## 2. Two entry points, one composer

| Path | Trigger | Seeds (candidate needs) |
|---|---|---|
| **Interactive** `POST /api/cart/build` | user types a request | parsed request **∪** what's predicted to run low |
| **Autonomous** `runAutoRestock()` | weekly agent / button | purely what's predicted to run low |

Both converge on the shared composer **`planCart()`** (`web/lib/compose.ts`). That is the
"one composer" — sourcing, LLM composition, and deterministic pricing happen in exactly
one place; the two entry points differ only in how they gather seeds.

```
Interactive: buildCart(text) ┐
                             ├─► seeds ─► planCart() ─► priced lines ─► purchase_items ─► split
Autonomous:  dueItems()  ────┘
```

---

## 3. The pipeline, step by step

### Step 0 — Resolve context (deterministic)
`route.ts` / `runAutoRestock()` resolve the household + acting user (no auth → seeded
defaults), and gather:
- **recentNames** — item names bought in the last 14 days (`purchase_items` join).
- **due items** — `dueItems(householdId)` (`web/lib/restock.ts`).

### Step 1 — Parse intent → needs (LLM, language only)
Only on the interactive path. `buildCart(text, recentNames)` (`web/lib/openai.ts`):
- Turns free text into `Need[] = { name, category, qty }` + `skipped[]`.
- Enforced by `CART_SCHEMA` (strict JSON schema: category `enum`, `qty` integer ≥ 1).
- Fallback: `CART_FALLBACKS` keyed on the normalized prompt (demo prompt always resolves).
- **No prices involved.** Output is names + categories only.

The autonomous path skips this — its needs are the due items directly.

### Step 2 — Assemble seeds
`seeds: { name, category }[]` = parsed needs ∪ due items (interactive), or due items
(autonomous). `planCart` dedupes by lowercased name, so a need that's both requested and
due appears once.

### Step 3 — Source real prices (scraper, deterministic)
For each seed, `getOffers(name, { category })` (`web/lib/scrape/index.ts`) runs the
**three-tier fallback** so a price always comes back:

| Tier | Source | When |
|---|---|---|
| 1 | live adapters (`serpapi`) | normal — real multi-vendor prices |
| 2 | named fixtures | live returns nothing, query is a scripted demo item |
| 3 | `synthesizeOffers` | live returns nothing **and** no fixture — deterministic per-query offers so an off-script prompt still prices out |

Listings are canonicalized across vendors (`web/lib/dedupe.ts`) into one `products` row;
one offer per vendor is written to `offers`; a `scrape_runs` row records which tier served
it. **The cheapest in-stock offer is the deterministic "best":**

```ts
const inStock = offers.filter(o => o.in_stock).sort((a, b) => a.price_cents - b.price_cents)
const best = inStock[0]                       // the price — a fact, from the scrape
const runnerUpCents = inStock[1]?.price_cents  // for savings + "was" strikethrough
```

### Step 4 — Build candidates (facts the LLM may see)
`planCart` turns each sourced seed into a `ComposeCandidate` — the **only** thing the LLM
learns about money:

```ts
{ name, category,
  unitPriceCents,   // cheapest in-stock offer (read-only fact)
  savingsCents,     // runnerUp − cheapest → the deal size
  offersCount,      // how many vendors compared
  dueSoon,          // predicted to run out (from dueNames)
  boughtRecently }  // in recentNames
```

It also computes **budget headroom**: `budgetRemainingCents = monthly_budget − month-to-date
spend` (`monthSpendCents`), where `0` means "no budget set → unlimited".

### Step 5 — Compose the cart (LLM, judgment over facts)
`composeCart({ request, budgetRemainingCents, candidates })` (`web/lib/openai.ts`). The
model decides the final cart:
- prioritize running-low / requested items,
- **skip** anything `boughtRecently` (don't re-buy),
- choose sensible quantities,
- keep the total within `budgetRemainingCents`; if over, drop lowest-priority items and
  skip them with reason `"trimmed to stay within budget"`,
- give each chosen item a one-phrase `reason`.

Output shape (`COMPOSE_SCHEMA`, strict): `{ items: { name, qty, reason }[], skipped: { name, reason }[] }`.
**No price field exists** on the output. The model may only choose candidates **by name** —
invented names are filtered out, `qty` is clamped to an integer ≥ 1.

Fallback: `composeHeuristic` — deterministic, same ordering the prompt asks for
(running-low first → bigger deal → greedy fill within budget). So the cart composes
intelligently even with the key pulled.

### Step 6 — Price the chosen cart (deterministic)
Back in `planCart`, each chosen name maps to the **same offer sourced in Step 3**, and
code does the arithmetic:

```ts
subtotal += s.best.price_cents * it.qty   // code multiplies, never the LLM
```

Produces `PlanLine[]` (name, category, qty, reason, `best` offer, offersCount,
runnerUpCents), `subtotalCents`, `dealsCompared`, `budgetRemainingCents`, `overBudget`.
Seeds with no offer at all are folded into `skipped` (`"no offers found"`).

### Step 7 — Persist + split
The entry point writes one `purchase_items` row per `PlanLine` (carrying `offer_id` and the
scraped `unit_price_cents`), sets the purchase subtotal, then runs the **deterministic split**
(`runSplit`) which applies each member's rules and writes `item_splits` + any approvals.

**Autonomous invariant:** `runAutoRestock` then *always* inserts a whole-cart approval and
leaves the purchase at `awaiting_approval` — even if no line tripped a threshold. Checkout
is gated on zero pending approvals, so the agent can never charge a card unattended.

---

## 4. Trust boundary (who is allowed to produce what)

| Concern | Owner | Never done by |
|---|---|---|
| Parse text → item names/categories | LLM (`buildCart`) | — |
| Predict what's running low | deterministic (`dueItems`, cadence) | LLM |
| Fetch prices | scraper (`getOffers`) | LLM |
| Pick cheapest offer | deterministic (`compose.ts`) | LLM |
| Choose what/how-many/skip | LLM (`composeCart`) | — |
| Multiply price × qty, subtotal | deterministic (`compose.ts`) | LLM |
| Split by rules, approvals, charge | deterministic (`runSplit`, payments) | LLM |

The LLM sits on exactly two rungs (parse, compose) and reads prices only as context.

---

## 5. Failure behavior (why the demo never dies)

| Failure | Result |
|---|---|
| OpenAI key missing / API down | `buildCart` → `CART_FALLBACKS`; `composeCart` → `composeHeuristic`. Cart still composes. |
| SerpAPI down / no key, scripted item | scraper tier 2 (named fixtures). |
| SerpAPI down, off-script item | scraper tier 3 (`synthesizeOffers`) — deterministic multi-vendor prices, never a blank line. |
| Item has no offers at all | folded into `skipped` with `"no offers found"`; rest of cart proceeds. |
| Composed cart exceeds budget | over-budget items skipped (`"trimmed to stay within budget"`); `overBudget` surfaced. |

Every degradation is deterministic and localized — no failure takes down the whole cart.

---

## 6. File map

| File | Role |
|---|---|
| `web/app/api/cart/build/route.ts` | Interactive entry: parse ∪ due → `planCart` → write + respond |
| `web/lib/auto-restock.ts` | Autonomous entry: due → `planCart` → write + gate approval |
| `web/lib/compose.ts` | **Shared composer** `planCart`: source → candidates → compose → price; `monthSpendCents` |
| `web/lib/openai.ts` | `buildCart` (parse), `composeCart` + `composeHeuristic` (compose), schemas |
| `web/lib/restock.ts` | `dueItems` / cadence prediction — what's running low |
| `web/lib/scrape/index.ts` | `getOffers` — 3-tier price sourcing |
| `web/lib/scrape/fixtures.ts` | Tier-2 fixtures + tier-3 `synthesizeOffers` |
| `web/lib/dedupe.ts` | Cross-vendor → canonical `products` |
| `web/lib/deals.ts` | `pickBest` / `savingsVsSecond` — cheapest in-stock helpers |
| `web/lib/split-run.ts` | Deterministic split applied after the cart is priced |

---

## 7. Known trade-offs / follow-ups

- **Sequential sourcing.** `planCart` sources offers in a `for` loop (`await getOffers`
  per seed). Fine for demo-size carts; `Promise.all` is the obvious speedup, and it matters
  more now that sourcing gates the LLM call.
- **Due staples injected into every interactive cart.** "restock the apartment" benefits;
  "snacks for Friday" may not want unrelated staples. A one-line gate on `request` (only
  union due items for restock-ish intents) is the knob if that becomes noise.
- **Quantities are lightly reasoned.** The composer defaults to qty 1; richer qty logic
  (pack sizes, per-person scaling) is future work and stays on the LLM-judgment side.

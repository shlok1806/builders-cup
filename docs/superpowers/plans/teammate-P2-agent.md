# Cartel — P2: Agent (the two OpenAI calls)

**You own:** both OpenAI calls, their prompts + JSON schemas, validation, dedupe, and cached fallbacks. Features **F2 (cart builder), F3 (policy compiler).**
**Full spec:** `architecture.md` §6. **Master plan:** `docs/superpowers/plans/2026-07-17-cartel.md`.

## Your global constraints
- **Exactly two LLM calls.** Both use OpenAI **structured outputs** (`response_format: json_schema`, `strict: true`) — not plain json mode.
- **Validate before use; re-ask once; cached fallback** keyed to the exact demo input on any failure.
- **Policy enum is exactly three:** `exclude_category | approval_threshold | split_weight`. (`weekly_cap`, `pay_from` are cut.)
- Cart builder **may only emit catalog `product_id`s** — reject + re-ask if it invents one.
- Integer cents everywhere.

## Interfaces you consume
- Seeded `products` (`id,name,category,price_cents,...`) and `policies` tables — from Phase 0 seed (P3).
- `admin()` server client from `lib/supabase.ts` (P1, Phase 0).

## Interfaces you produce (others depend on these signatures)
```ts
// lib/openai.ts
buildCart(text: string, catalog: {id,name,category}[], recentNames: string[]):
  Promise<{ items:{product_id:string,qty:number}[], skipped:{name:string,reason:string}[] }>
compilePolicy(sentence: string):
  Promise<{ type:'exclude_category'|'approval_threshold'|'split_weight', params: object }>
```
- `POST /api/cart/build { text } → { purchaseId, items:[{id,name,qty,category,unit_price_cents}], skipped:[{name,reason}] }`
- `POST /api/policy/compile { userId, text } → { policy:{id,type,params,source_text} }`

## Phase 0 (whole team, blocking — start your track only after green)
No lead task, but confirm the **catalog categories and the demo prompts** during Task 0.4 — you need the exact demo prompt strings to build the cached fallbacks.

---

## Task P2.1: OpenAI client + schemas + fallbacks
**Files:** Create `lib/openai.ts`
- [ ] Create the client + the two `json_schema` response formats matching `architecture.md` §6 (Call A: `items`/`skipped`; Call B: enum `type` + `params`), `strict: true`.
- [ ] `buildCart`: system prompt = "build a cart from a fixed catalog, only use provided product IDs, skip anything in recent-purchases with a reason, JSON only." Parse → **reject any product_id not in catalog, re-ask once** → cached fallback on second failure/error.
- [ ] `compilePolicy`: system prompt = "compile one household spending rule into one JSON policy, choose exactly one type from the enum, JSON only." Validate type∈enum + params shape → re-ask once → cached fallback.
- [ ] `FALLBACKS` map: exact demo prompt string → known-good parsed object, for both calls.

## Task P2.2: Cart builder route — F2
**Files:** Create `app/api/cart/build/route.ts`
- [ ] Load catalog (`products`) + recent purchase item names for the household (last 14 days) via `admin()`.
- [ ] Call `buildCart(text, catalog, recentNames)`.
- [ ] Create `purchases` row (`status:'building'`, `created_by`, `note:text`); insert `purchase_items` per returned product_id (copy `name`, `category`, `unit_price_cents=price_cents`, `qty`); compute + store `subtotal_cents`.
- [ ] Return `{ purchaseId, items, skipped }`. Verify: `curl -XPOST .../api/cart/build -d '{"text":"restock + snacks for Friday"}'` → catalog products only, paper towels in `skipped`.
- [ ] Commit: `git commit -m "feat: agentic cart builder (Call A) + route"`

## Task P2.3: Policy compiler route — F3
**Files:** Create `app/api/policy/compile/route.ts`
- [ ] Call `compilePolicy(text)`; validate.
- [ ] Insert `policies` row (`user_id`, `household_id`, `type`, `params`, `source_text:text`). Return it.
- [ ] Verify: `curl` with `"don't split alcohol to me"` → `exclude_category / {category:'alcohol'}` inserted.
- [ ] Commit: `git commit -m "feat: policy compiler (Call B) + route"`

## Integration gates you're on
- **I1:** your cart builder feeds P3's split → P1's SplitView. Confirm output is catalog-only, deduped.
- **I2:** a live-typed rule compiles (P2.3) and P3's re-split reflects it.

## Reliability (you own this for your two calls)
Test both cached fallbacks with the network unplugged before hour 6 — the demo must survive a dead model.

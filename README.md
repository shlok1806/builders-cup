# Cartel

Ramp for a shared cart — describe what you bought, an agent builds the cart, a
deterministic engine splits it by each roommate's policies, flagged lines get
approved in realtime on the owner's phone, everyone's card is charged at
checkout, and the dashboard updates. Mobile-first installable PWA.

## The app lives in `web/`

**There is one app. It is `web/`.** (An earlier root-level scaffold was
consolidated in — do not re-create `app/` or `lib/` at the repo root. The root
`package.json` is a script-only delegator, nothing else.)

```bash
cd web && npm install                # deps live in web/
cp .env.local.example .env.local     # fill in the env vars below
npm run seed                         # seed Supabase with the demo household
npm run dev:mobile                   # next dev -H 0.0.0.0  (phone can reach it)
```

Scripts also work from the **repo root** (they delegate into `web/`):
`npm run dev` · `dev:mobile` · `build` · `start:mobile` · `test` · `seed` ·
`smoke` · `lint`. Only `npm install` must run in `web/`.

Open http://localhost:3000. For the two-device demo: laptop joins the phone's
hotspot, phone opens `http://<laptop-local-ip>:3000`, adds to home screen.

**Seeing 500s / "module not found in the React Client Manifest" in dev?** That's
a stale Turbopack cache (common after moving/renaming files). Fix:
`pkill -f "next dev"; rm -rf web/.next` then start again.

## Routes (all under `web/app/api`)

| Route | Owner | Purpose |
|---|---|---|
| `POST /api/cart/build` | P2 | free text → catalog-constrained, deduped cart |
| `POST /api/policy/compile` | P2 | one rule sentence → one structured policy |
| `POST /api/purchase/[id]/split` | P3 | deterministic split → `item_splits` + approvals |
| `POST /api/approval/[id]` | P3 | approve/decline (re-splits on decline) |
| `GET /api/approvals?user=` | P3 | pending approvals — device seed + poll fallback |
| `GET /api/dashboard` | P3 | this-month spend by category/user vs budget |
| `POST /api/purchase/[id]/checkout` | P4 | N PaymentIntents → `charges` |
| `GET /api/purchase/[id]/summary` | P4 | savings card (`savedCents`, `stepsCollapsed`) |

Frontend (P1): `/` dashboard · `/cart` build→split · `/approve?user=<id>` device.

## Env vars (`web/.env.local`)

`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` ·
`SUPABASE_SERVICE_ROLE_KEY` · `OPENAI_API_KEY` · `STRIPE_SECRET_KEY` ·
`NEXT_PUBLIC_REALTIME` (`1` = realtime, else 1.5s poll fallback).

## Known integration seams

- **P2 → Supabase is wired.** `web/lib/agent-data.ts` reads the seeded `products`
  catalog and writes real `purchases` / `purchase_items` / `policies` rows via the
  service role. `cart/build → purchase/[id]/split` runs end-to-end on real data
  (verified: cart builds a `building` purchase, split flags the $52 tequila over
  Sam's $40 threshold). The model fallback is keyed to the canonical demo prompt
  and resolves product **names** against the live catalog, so a dead model still
  writes the right rows. Caveat: the frontend has no auth, so `purchases.created_by`
  is `null` unless a route caller passes a real `users.id`.
- **Approval device needs a real user id.** `?user=<id>` must match a seeded
  `users.id` (UUID). The mock roster in `web/lib/data.ts` uses friendly ids for
  offline rendering; wire real UUIDs for the live two-device beat.

Full spec: [ARCHITECTURE.md](ARCHITECTURE.md). Plans: [docs/superpowers/plans/](docs/superpowers/plans/).

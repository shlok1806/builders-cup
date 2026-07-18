# Cartel

Ramp for a shared cart — describe what you bought, an agent builds the cart, a
deterministic engine splits it by each roommate's policies, flagged lines get
approved in realtime on the owner's phone, everyone's card is charged at
checkout, and the dashboard updates. Mobile-first installable PWA.

## The app lives in `web/`

**There is one app. It is `web/`.** (An earlier root-level scaffold was
consolidated in — do not re-create `app/` or `lib/` at the repo root.)

```bash
cd web
npm install
cp .env.local.example .env.local   # fill in the env vars below
npm run seed                       # seed Supabase with the demo household
npm run dev:mobile                 # next dev -H 0.0.0.0  (phone can reach it)
```

Open http://localhost:3000. For the two-device demo: laptop joins the phone's
hotspot, phone opens `http://<laptop-local-ip>:3000`, adds to home screen.

Scripts (all run from `web/`): `dev` · `dev:mobile` · `build` · `start:mobile`
· `test` (vitest) · `seed` · `smoke` (agent fallback rehearsal).

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

- **P2 writes to an in-memory fixture, not Supabase yet.** `web/lib/agent-data.ts`
  is a swap-point shim (see its header). Until it reads/writes real tables,
  `/api/cart/build` returns a `purchaseId` that `/api/purchase/[id]/split`
  (DB-backed) can't find — the cart→split chain works via the frontend's seed
  fallback, not end-to-end. P2 owns closing this.
- **Approval device needs a real user id.** `?user=<id>` must match a seeded
  `users.id` (UUID). The mock roster in `web/lib/data.ts` uses friendly ids for
  offline rendering; wire real UUIDs for the live two-device beat.

Full spec: [ARCHITECTURE.md](ARCHITECTURE.md). Plans: [docs/superpowers/plans/](docs/superpowers/plans/).

# Cartel — P1: Frontend / UX

**You own:** app shell, user switcher, cart view, split view, approval UI, dashboard, savings card, and final polish. Features **F1, F5-UI, F7-UI, F8, design.**
**Full spec:** `architecture.md`. **Master plan:** `docs/superpowers/plans/2026-07-17-cartel.md`.

## Your global constraints
- **No auth.** `UserSwitcher` sets "who am I" (cookie/localStorage). Approval device reads `?user=<id>` — it overrides the switcher.
- **Realtime** behind `NEXT_PUBLIC_REALTIME=1`; else 1.5s poll fallback. Browser subscribes with the **anon** key.
- **Mobile-first PWA.** Every screen is phone-first and installable. Demo path: phone provides the hotspot/local LAN, laptop joins it and runs the app on `0.0.0.0`, phone opens `http://<laptop-local-ip>:3000`, then adds it to the home screen.
- **Integer cents** everywhere; format to dollars only at render.
- Build against **seed data first**, wire to routes as they land. Polish is **last** (hour 7–8.5).

## Interfaces you consume (built by others)
- `POST /api/cart/build { text } → { purchaseId, items:[{id,name,qty,category,unit_price_cents}], skipped:[{name,reason}] }` — P2
- `POST /api/policy/compile { userId, text } → { policy }` — P2
- `POST /api/purchase/[id]/split → { lines:[{itemId,name,category,lineTotalCents, splits:[{userId,amountCents}], flag?:{approverId,rule}}] }` — P3
- `POST /api/approval/[id] { decision:'approved'|'declined' } → { ok }` — P3
- `GET /api/approvals?user=<id> → { pending:[{id,purchaseItemId,rule,itemName,amountCents}] }` — P3 (initial load + poll fallback)
- `GET /api/dashboard → { thisMonthCents, byCategory:[{category,cents}], byUser:[{userId,name,cents}], budgetCents, overBudget }` — P3
- `POST /api/purchase/[id]/checkout → { charges:[{userId,amountCents,status}] }` — P4
- `GET /api/purchase/[id]/summary → { savedCents, stepsCollapsed }` — P4

## Phase 0 (whole team, blocking — do NOT start your track until green)
**You lead Task 0.1 + 0.5 (scaffold + mobile gate):** `npx create-next-app@latest . --ts --app --tailwind --eslint --use-npm --yes`, install deps, add `app/manifest.ts` + `public/icon-192.png` + `public/icon-512.png`, add `dev:mobile` (`next dev -H 0.0.0.0`) + `start:mobile` (`next start -H 0.0.0.0`), write `.env.local` + `lib/supabase.ts`, then prove the actual demo phone can open the laptop IP, add the app to home screen, launch it, and load `/approve?user=<sam>`. See master plan for exact steps. Then join 0.4 (agree the 7 beats + numbers).

---

## Task P1.1: Shell + user switcher + realtime provider — F1
**Files:** Create `app/layout.tsx`, `components/UserSwitcher.tsx`, `components/RealtimeProvider.tsx`, `lib/useMe.ts`
- [ ] Top bar: household name + `UserSwitcher` (dropdown over seeded users; stores selected id; `useMe()` reads it). `?user=<id>` overrides. Layout is phone-first: one-column defaults, large tap targets, no desktop-only hover interactions.
- [ ] `RealtimeProvider`: on mount, **seed state from `GET /api/approvals?user=<me>`** (realtime only delivers events fired *after* subscribe — an already-pending approval emits nothing). Then, if `NEXT_PUBLIC_REALTIME=1`, `browser()` subscribes to `approvals` inserts/updates; else poll `GET /api/approvals?user=<me>` every 1.5s. Expose latest pending approval via context.
- [ ] Verify: switching users updates "who am I"; a manually-inserted `approvals` row logs in the provider.
- [ ] Commit: `git commit -m "feat: app shell, user switcher, realtime provider"`

## Task P1.2: Dashboard (landing) — F7 UI
**Files:** Create `app/page.tsx`, `components/CategoryBreakdown.tsx`, `components/PerPersonTotals.tsx`
- [ ] Fetch `/api/dashboard`; render "this month" number, category breakdown, per-person totals, over-budget flag. Ramp-style, clean, and readable at phone width. This is the screen the demo opens on from the installed PWA.
- [ ] Verify against seeded backdated data (must be non-empty). Commit.

## Task P1.3: Cart builder + cart view + split view — F2/F4 UI
**Files:** Create `app/cart/page.tsx`, `components/CartInput.tsx`, `components/CartView.tsx`, `components/SplitView.tsx`
- [ ] `CartInput` → posts text to `/api/cart/build`; render cart items + a "skipped (reason)" list ("skipped paper towels — bought Tuesday"). **Add a one-tap chip pre-filled with the exact canonical demo prompt** so the presenter never retypes it — this guarantees P2's normalized fallback cache hits if the model is down. Free typing still allowed.
- [ ] Button → posts to `/api/purchase/[id]/split`; `SplitView` renders each line with per-user amounts + annotations ("alcohol excluded for Priya", "flagged: over Sam's $40 threshold").
- [ ] Verify the seeded-cart flow end to end visually. Commit.

## Task P1.4: Approval device screen — F5 UI
**Files:** Create `app/approve/page.tsx`, `components/ApprovalCard.tsx`
- [ ] Reads `?user=<id>`; consumes `RealtimeProvider` (which seeds from `GET /api/approvals` then listens); when a pending approval targets this user, show a phone-sized `ApprovalCard` ("Approve $52 tequila?") with Approve/Decline → posts `/api/approval/[id]`. **Demo device is the installed PWA at `http://<laptop-local-ip>:3000/approve?user=<sam>`** — the tequila trips *Sam's* $40 rule, so the card lands on Sam's phone (matches beat 5).
- [ ] Verify the two-device beat on the installed phone PWA over the phone-hotspot/laptop-local-IP path (with P3/P4). Commit.

## Task P1.5: Savings card + polish — F8
**Files:** Create `components/SavingsCard.tsx`; polish pass across screens.
- [ ] After checkout, show `SavingsCard` from `/summary` (`$X saved`, "N steps → 1"). Animate the four charge cards to "charged" in the checkout view — this is the money-shot.
- [ ] Design polish last. Commit.

## Integration gates you're on
- **I1:** cart → split → SplitView renders correctly (with P2, P3).
- **I2:** live-typed rule reflected in split view (with P2, P3).
- **I3:** flag → realtime → approve on two devices, with the phone running the installed PWA from the laptop local IP → checkout unblocks (with P3).
- **I4:** checkout → charge cards animate → dashboard + savings update (with P4, P3).

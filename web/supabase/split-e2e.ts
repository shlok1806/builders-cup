// End-to-end split test — real DB path (runSplit), every rule type.
// Run: npx tsx --env-file=.env.local supabase/split-e2e.ts
// Creates an isolated "[e2e]" household so it never touches `npm run seed` data,
// then deletes it at the end. ponytail: demo harness, split.test.ts stays the unit gate.
import { admin } from '../lib/supabase'
import { runSplit } from '../lib/split-run'

const db = admin()
const $ = (c: number) => `$${(c / 100).toFixed(2)}`
let fails = 0
function check(label: string, cond: boolean, detail = '') {
  console.log(`  ${cond ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) fails++
}

async function main() {
  // --- isolated household + members ---
  const { data: hh } = await db
    .from('households')
    .insert({ name: '[e2e] split test', monthly_budget_cents: 150000 })
    .select('id')
    .single()
  const householdId = hh!.id

  const { data: users } = await db
    .from('users')
    .insert(['Sam', 'Priya', 'Alex', 'Jordan'].map((name) => ({ name, household_id: householdId })))
    .select('id, name')
  const uid = (n: string) => users!.find((u) => u.name === n)!.id
  const name = (id: string) => users!.find((u) => u.id === id)!.name
  const splitByName = (rows: { user_id: string; amount_cents: number }[]) =>
    Object.fromEntries(rows.map((r) => [name(r.user_id), r.amount_cents]))

  // Policies covering EVERY rule type. Everyone excludes 'tobacco' -> orphan test.
  await db.from('policies').insert([
    { user_id: uid('Sam'), household_id: householdId, type: 'approval_threshold', params: { amount_cents: 4000 } },
    { user_id: uid('Sam'), household_id: householdId, type: 'exclude_category', params: { category: 'tobacco' } },
    { user_id: uid('Priya'), household_id: householdId, type: 'exclude_category', params: { category: 'alcohol' } },
    { user_id: uid('Priya'), household_id: householdId, type: 'exclude_category', params: { category: 'tobacco' } },
    { user_id: uid('Alex'), household_id: householdId, type: 'exclude_category', params: { category: 'meat' } },
    { user_id: uid('Alex'), household_id: householdId, type: 'exclude_category', params: { category: 'tobacco' } },
    { user_id: uid('Jordan'), household_id: householdId, type: 'split_weight', params: { weight: 2 } },
    { user_id: uid('Jordan'), household_id: householdId, type: 'exclude_category', params: { category: 'tobacco' } },
  ])

  // Helper: build a purchase + items, run the real split, return DB-read results.
  async function buildAndSplit(
    note: string,
    items: { name: string; category: string; unit_price_cents: number; qty?: number }[],
    recurringCartId?: string,
  ) {
    const subtotal = items.reduce((s, it) => s + it.unit_price_cents * (it.qty ?? 1), 0)
    const { data: purchase } = await db
      .from('purchases')
      .insert({ household_id: householdId, note, subtotal_cents: subtotal, created_by: uid('Sam'), recurring_cart_id: recurringCartId ?? null })
      .select('id')
      .single()
    await db.from('purchase_items').insert(items.map((it) => ({ purchase_id: purchase!.id, name: it.name, category: it.category, unit_price_cents: it.unit_price_cents, qty: it.qty ?? 1 })))
    const view = await runSplit(purchase!.id) // <-- the real end-to-end path
    const { data: splits } = await db
      .from('item_splits')
      .select('purchase_item_id, user_id, amount_cents, purchase_items!inner(purchase_id)')
      .eq('purchase_items.purchase_id', purchase!.id)
    const { data: approvals } = await db
      .from('approvals')
      .select('purchase_item_id, approver_id, status, rule')
      .eq('purchase_id', purchase!.id)
    const { data: pRow } = await db.from('purchases').select('status, subtotal_cents').eq('id', purchase!.id).single()
    return { purchaseId: purchase!.id, view, splits: splits ?? [], approvals: approvals ?? [], purchase: pRow! }
  }

  // ============ Scenario 1: one cart, four rule types at once ============
  console.log('\n=== Scenario 1: even / weight / exclude / threshold / orphan in one cart ===')
  const s1 = await buildAndSplit('mixed cart', [
    { name: 'Tortilla Chips', category: 'snacks', unit_price_cents: 1000 }, // weight 1:1:1:2
    { name: 'Ribeye Steak', category: 'meat', unit_price_cents: 3000 }, // Alex excluded
    { name: 'Casamigos Tequila', category: 'alcohol', unit_price_cents: 5200 }, // Priya excl + trips Sam $40
    { name: 'Cigarettes', category: 'tobacco', unit_price_cents: 1500 }, // everyone excludes -> orphan
  ])
  for (const line of s1.view) {
    const rows = s1.splits.filter((r) => r.purchase_item_id === line.itemId)
    const by = splitByName(rows)
    const sum = rows.reduce((s, r) => s + r.amount_cents, 0)
    console.log(`  ${line.name.padEnd(18)} ${$(line.lineTotalCents).padStart(7)} -> ${Object.entries(by).map(([n, c]) => `${n}:${$(Number(c))}`).join('  ')}`)
    check(`${line.name}: reconciles to total`, sum === line.lineTotalCents, `${$(sum)} vs ${$(line.lineTotalCents)}`)
    if (line.name === 'Tortilla Chips') check('  weight: Jordan pays 2x Sam', by.Jordan === 2 * by.Sam, `${$(by.Jordan)} vs ${$(by.Sam)}`)
    if (line.name === 'Ribeye Steak') check('  exclude: Alex not charged for meat', by.Alex === undefined)
    if (line.name === 'Casamigos Tequila') check('  exclude: Priya not charged for alcohol', by.Priya === undefined)
    if (line.name === 'Cigarettes') check('  orphan: all-excluded line restored to all 4', rows.length === 4)
  }
  const tequila = s1.view.find((l) => l.name === 'Casamigos Tequila')!
  const tequilaAppr = s1.approvals.find((a) => a.purchase_item_id === tequila.itemId)
  check('threshold: tequila has a pending approval for Sam', tequilaAppr?.status === 'pending' && tequilaAppr?.approver_id === uid('Sam'))
  check('threshold: exactly one line flagged', s1.approvals.length === 1)
  check('purchase status = awaiting_approval', s1.purchase.status === 'awaiting_approval')

  // ============ Scenario 2: recurring standing verdict 'always' -> auto-approve ============
  console.log("\n=== Scenario 2: recurring cart, Sam standing 'always' -> auto-approved ===")
  const { data: rcAlways } = await db.from('recurring_carts').insert({ name: 'always cart', owner_id: uid('Sam'), household_id: householdId, items: [] }).select('id').single()
  await db.from('recurring_cart_approvals').insert({ recurring_cart_id: rcAlways!.id, approver_id: uid('Sam'), decision: 'always' })
  const s2 = await buildAndSplit('always cart run', [{ name: 'Casamigos Tequila', category: 'alcohol', unit_price_cents: 5200 }], rcAlways!.id)
  const a2 = s2.approvals[0]
  check('auto-approved: approval row status = approved', a2?.status === 'approved' && a2?.approver_id === uid('Sam'))
  check('no pending approvals', s2.approvals.every((a) => a.status !== 'pending'))
  check('item kept (splits exist)', s2.splits.length === 3)
  check('purchase status = building (not blocked)', s2.purchase.status === 'building')

  // ============ Scenario 3: recurring standing verdict 'never' -> drop item ============
  console.log("\n=== Scenario 3: recurring cart, Sam standing 'never' -> item dropped ===")
  const { data: rcNever } = await db.from('recurring_carts').insert({ name: 'never cart', owner_id: uid('Sam'), household_id: householdId, items: [] }).select('id').single()
  await db.from('recurring_cart_approvals').insert({ recurring_cart_id: rcNever!.id, approver_id: uid('Sam'), decision: 'never' })
  const s3 = await buildAndSplit('never cart run', [
    { name: 'Casamigos Tequila', category: 'alcohol', unit_price_cents: 5200 }, // dropped
    { name: 'Bananas', category: 'groceries', unit_price_cents: 300, qty: 2 }, // survives
  ], rcNever!.id)
  const tequilaGone = !s3.view.some((l) => l.name === 'Casamigos Tequila')
  check('never: tequila line dropped from view', tequilaGone)
  check('never: tequila splits removed', !s3.splits.some((r) => s3.view.every((l) => l.itemId !== r.purchase_item_id) && false) && s3.splits.length === 4)
  check('never: subtotal recomputed to survivors only ($6.00)', s3.purchase.subtotal_cents === 600, $(s3.purchase.subtotal_cents))
  check('never: no pending approval left', s3.approvals.every((a) => a.status !== 'pending'))

  // --- cleanup: delete the isolated household in FK order ---
  const { data: purchIds } = await db.from('purchases').select('id').eq('household_id', householdId)
  const pids = (purchIds ?? []).map((p) => p.id)
  const { data: itemIds } = pids.length ? await db.from('purchase_items').select('id').in('purchase_id', pids) : { data: [] }
  const iids = (itemIds ?? []).map((i) => i.id)
  if (iids.length) await db.from('item_splits').delete().in('purchase_item_id', iids)
  if (pids.length) await db.from('approvals').delete().in('purchase_id', pids)
  if (iids.length) await db.from('purchase_items').delete().in('id', iids)
  if (pids.length) await db.from('purchases').delete().in('id', pids)
  await db.from('recurring_cart_approvals').delete().in('recurring_cart_id', (await db.from('recurring_carts').select('id').eq('household_id', householdId)).data?.map((r) => r.id) ?? [])
  await db.from('recurring_carts').delete().eq('household_id', householdId)
  await db.from('policies').delete().eq('household_id', householdId)
  await db.from('users').delete().eq('household_id', householdId)
  await db.from('households').delete().eq('id', householdId)

  console.log(`\n${fails === 0 ? '🎉 ALL PASSED — splitting works end-to-end' : `💥 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

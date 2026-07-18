// Seed — locks the demo numbers (architecture.md §12). Idempotent wipe-and-reinsert.
// Run: `npm run seed` (loads .env.local). Stripe PMs are P4's part — guarded on
// STRIPE_SECRET_KEY so P3 can seed + verify without it (placeholder PM rows).
import { admin } from '../lib/supabase'
import { computeSplit } from '../lib/split'
import { canonicalKey } from '../lib/dedupe'
import type { Member, Line } from '../lib/types'

const db = admin()

async function wipe() {
  // FK order. offers is after purchase_items (purchase_items.offer_id -> offers)
  // and before products (offers.product_id -> products).
  for (const t of [
    'charges',
    'item_splits',
    'approvals',
    'purchase_items',
    'offers',
    'restock_subscriptions',
    'scrape_runs',
    'purchases',
    'recurring_cart_approvals',
    'recurring_carts',
    'policies',
    'payment_methods',
    'products',
    'users',
    'households',
  ])
    await db.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000')
}

async function main() {
  await wipe()

  const { data: hh } = await db
    .from('households')
    .insert({ name: 'Franklin St.', monthly_budget_cents: 150000 })
    .select('id')
    .single()
  const householdId = hh!.id

  const userDefs = [
    { name: 'Sam', color: 'household' },
    { name: 'Priya', color: 'alcohol' },
    { name: 'Alex', color: 'meat' },
    { name: 'Jordan', color: 'groceries' },
  ]
  const { data: users } = await db
    .from('users')
    .insert(userDefs.map((u) => ({ ...u, household_id: householdId })))
    .select('id, name')
  const uid = (name: string) => users!.find((u) => u.name === name)!.id

  // Policies (pre-compiled — don't rely on the LLM for seed).
  await db.from('policies').insert([
    {
      user_id: uid('Sam'),
      household_id: householdId,
      type: 'approval_threshold',
      params: { amount_cents: 4000 },
      source_text: 'ask me before anything over $40',
    },
    {
      user_id: uid('Priya'),
      household_id: householdId,
      type: 'exclude_category',
      params: { category: 'alcohol' },
      source_text: "don't split alcohol to me",
    },
    {
      user_id: uid('Alex'),
      household_id: householdId,
      type: 'exclude_category',
      params: { category: 'meat' },
      source_text: "I'm vegetarian, no meat",
    },
    {
      user_id: uid('Jordan'),
      household_id: householdId,
      type: 'split_weight',
      params: { weight: 2 },
      source_text: 'I use more, give me a double share',
    },
  ])

  // Catalog. Tequila $52 trips Sam's $40 threshold; snack line $10.00 (mult of 5)
  // so Jordan's 2x share is exact cents. Paper towels for the dedupe beat.
  const catalog = [
    { name: 'Casamigos Tequila', category: 'alcohol', price_cents: 5200, unit: '750ml' },
    { name: 'Ribeye Steak', category: 'meat', price_cents: 3000, unit: '2 lb' },
    { name: 'Tortilla Chips', category: 'snacks', price_cents: 1000, unit: 'bag' },
    { name: 'Bananas', category: 'groceries', price_cents: 300, unit: 'bunch' },
    { name: 'Oat Milk', category: 'groceries', price_cents: 550, unit: 'carton' },
    { name: 'Paper Towels', category: 'household', price_cents: 1800, unit: '6-pack' },
    { name: 'Dish Soap', category: 'cleaning', price_cents: 450, unit: 'bottle' },
    { name: 'Sparkling Water', category: 'snacks', price_cents: 800, unit: '12-pack' },
    { name: 'Coffee', category: 'groceries', price_cents: 1549, unit: '28 oz' },
  ]
  const { data: products } = await db
    .from('products')
    .insert(catalog.map((c) => ({ ...c, canonical_key: canonicalKey(c.name, c.unit) })))
    .select('id, name, category, price_cents')
  const prod = (name: string) => products!.find((p) => p.name === name)!

  // Recurring cart so the reorder + standing-verdict flow has something to run
  // in the demo (settings "Reorder", /api/recurring, the approval device).
  await db.from('recurring_carts').insert({
    name: 'Weekly groceries',
    owner_id: uid('Sam'),
    household_id: householdId,
    items: [
      { product_id: prod('Bananas').id, qty: 2 },
      { product_id: prod('Oat Milk').id, qty: 1 },
    ],
  })

  // Payment methods — real Stripe if a key is present, else placeholders (P4 swaps in).
  const stripeKey = process.env.STRIPE_SECRET_KEY
  for (const u of users!) {
    let customer = `seed_cus_${u.name.toLowerCase()}`
    let pm = `seed_pm_${u.name.toLowerCase()}`
    if (stripeKey) {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(stripeKey)
      const c = await stripe.customers.create({ name: u.name })
      const attached = await stripe.paymentMethods.attach('pm_card_visa', { customer: c.id })
      await stripe.customers.update(c.id, { invoice_settings: { default_payment_method: attached.id } })
      customer = c.id
      pm = attached.id
    }
    await db.from('payment_methods').insert({
      user_id: u.id,
      stripe_customer_id: customer,
      stripe_pm_id: pm,
      last4: '4242',
      brand: 'visa',
    })
  }

  // Members for computing prior-purchase splits (mirror the seeded policies).
  const members: Member[] = [
    { userId: uid('Sam'), weight: 1, excludedCategories: [], approvalThresholdCents: 4000 },
    { userId: uid('Priya'), weight: 1, excludedCategories: ['alcohol'], approvalThresholdCents: null },
    { userId: uid('Alex'), weight: 1, excludedCategories: ['meat'], approvalThresholdCents: null },
    { userId: uid('Jordan'), weight: 2, excludedCategories: [], approvalThresholdCents: null },
  ].sort((a, b) => (a.userId < b.userId ? -1 : 1))

  // Backdated prior purchases (created_at earlier this month) so the dashboard
  // isn't empty. Includes paper towels for the dedupe beat.
  const now = new Date()
  const daysAgo = (d: number) =>
    new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - d)).toISOString()

  const priors: { note: string; when: string; items: { p: string; qty: number }[] }[] = [
    {
      note: 'Weekly restock',
      when: daysAgo(6),
      items: [
        { p: 'Bananas', qty: 2 },
        { p: 'Oat Milk', qty: 2 },
        { p: 'Paper Towels', qty: 1 },
        { p: 'Dish Soap', qty: 1 },
        { p: 'Ribeye Steak', qty: 1 },
      ],
    },
    {
      note: 'Game night',
      when: daysAgo(3),
      items: [
        { p: 'Tortilla Chips', qty: 2 },
        { p: 'Sparkling Water', qty: 1 },
        { p: 'Casamigos Tequila', qty: 1 },
      ],
    },
  ]

  for (const pr of priors) {
    const itemRows = pr.items.map((i) => {
      const p = prod(i.p)
      return {
        product_id: p.id,
        name: p.name,
        qty: i.qty,
        unit_price_cents: p.price_cents,
        category: p.category,
      }
    })
    const subtotal = itemRows.reduce((s, it) => s + it.unit_price_cents * it.qty, 0)
    const { data: purchase } = await db
      .from('purchases')
      .insert({
        household_id: householdId,
        status: 'charged',
        subtotal_cents: subtotal,
        note: pr.note,
        created_by: uid('Sam'),
        created_at: pr.when,
      })
      .select('id')
      .single()
    const { data: inserted } = await db
      .from('purchase_items')
      .insert(itemRows.map((it) => ({ ...it, purchase_id: purchase!.id })))
      .select('id, category, unit_price_cents, qty')

    const lines: Line[] = inserted!.map((it) => ({
      itemId: it.id,
      category: it.category,
      lineTotalCents: it.unit_price_cents * it.qty,
    }))
    const { allocations } = computeSplit(lines, members)
    await db.from('item_splits').insert(
      allocations.map((a) => ({
        purchase_item_id: a.itemId,
        user_id: a.userId,
        amount_cents: a.amountCents,
      }))
    )
  }

  console.log('seed complete:', {
    household: householdId,
    users: users!.length,
    products: products!.length,
    priorPurchases: priors.length,
    stripe: stripeKey ? 'real' : 'placeholder',
  })
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e)
  process.exit(1)
})

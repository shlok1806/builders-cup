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

  // Multi-vendor offers per product — the cheapest is the product's reference
  // price, with pricier runners-up so "cheapest of N" and the savings number are
  // real. deals.bestOffer / savingsVsSecond read these.
  const OFFER_VENDORS = ['Walmart', 'Target', 'Amazon'] as const
  const offerRows = catalog.flatMap((c) => {
    const base = c.price_cents
    const ladder = [base, Math.round(base * 1.1), Math.round(base * 1.18)]
    return OFFER_VENDORS.map((vendor, i) => ({
      product_id: prod(c.name).id,
      vendor,
      url: null,
      price_cents: ladder[i],
      unit: c.unit,
      in_stock: true,
    }))
  })
  await db.from('offers').insert(offerRows)

  // Restock subscriptions — the autonomous agent's watchlist. Coffee + paper
  // towels are backdated so they fall "due" within the 7-day horizon; dish soap
  // is a longer cadence bought recently, so the agent correctly leaves it out.
  const dayISO = (d: number) =>
    new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString()
  await db.from('restock_subscriptions').insert([
    { household_id: householdId, product_id: prod('Coffee').id, cadence_days: 14, lead_days: 2, last_purchased_at: dayISO(13) },
    { household_id: householdId, product_id: prod('Paper Towels').id, cadence_days: 10, lead_days: 2, last_purchased_at: dayISO(6) },
    { household_id: householdId, product_id: prod('Dish Soap').id, cadence_days: 30, lead_days: 2, last_purchased_at: dayISO(6) },
  ])

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

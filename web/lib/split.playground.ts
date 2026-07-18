// Fake-cart playground for the split engine. Edit the scenarios, then:
//   npx tsx lib/split.playground.ts
// ponytail: throwaway eyeball harness, not a test — split.test.ts is the real check.
import { computeSplit } from './split'
import type { Member, Line } from './types'

const $ = (c: number) => `$${(c / 100).toFixed(2)}`

function run(name: string, members: Member[], lines: Line[]) {
  const { allocations, flagged } = computeSplit(lines, members)
  console.log(`\n=== ${name} ===`)
  for (const l of lines) {
    const rows = allocations.filter((a) => a.itemId === l.itemId)
    const sum = rows.reduce((s, a) => s + a.amountCents, 0)
    const who = rows.map((a) => `${a.userId}:${$(a.amountCents)}`).join('  ')
    const ok = sum === l.lineTotalCents ? 'OK' : `MISMATCH (${$(sum)})`
    console.log(`${l.itemId.padEnd(10)} ${l.category.padEnd(8)} ${$(l.lineTotalCents).padStart(8)} -> ${who}   [${ok}]`)
  }
  for (const f of flagged) console.log(`  ⚑ ${f.itemId} needs ${f.approverId}: ${f.rule}`)
}

// --- Fake household ---
const household: Member[] = [
  { userId: 'sam', weight: 1, excludedCategories: [], approvalThresholdCents: 4000 }, // approves >$40
  { userId: 'priya', weight: 1, excludedCategories: ['alcohol'], approvalThresholdCents: null },
  { userId: 'alex', weight: 2, excludedCategories: ['meat'], approvalThresholdCents: null }, // eats double
  { userId: 'jordan', weight: 1, excludedCategories: [], approvalThresholdCents: null },
]

// --- Fake carts: edit freely ---
run('weekly groceries', household, [
  { itemId: 'milk', category: 'dairy', lineTotalCents: 499 },
  { itemId: 'ribeye', category: 'meat', lineTotalCents: 2350 }, // alex excluded
  { itemId: 'wine', category: 'alcohol', lineTotalCents: 5200 }, // priya excluded + trips sam's $40
  { itemId: 'bread', category: 'bakery', lineTotalCents: 333 }, // odd cents -> rounding
])

run('everyone excludes it (orphan rule)', household, [
  { itemId: 'catfood', category: 'pets', lineTotalCents: 1799 },
])
// ^ nobody excludes 'pets' here; to test orphan, give all members excludedCategories: ['pets'].

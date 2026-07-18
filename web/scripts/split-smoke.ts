// End-to-end splitter check: LLM builds a cart from free text, then the
// deterministic engine splits it. Asserts the money invariants.
//   npx tsx scripts/split-smoke.ts          -> LLM live (needs OPENAI_API_KEY)
// Falls back to the cached path automatically if the model/network is down.
import { readFileSync } from "fs";
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

import { buildCart } from "../lib/openai";
import { computeSplit } from "../lib/split";
import { PRODUCTS, RECENT_PURCHASE_NAMES } from "../lib/catalog.fixture";
import type { Member, Line } from "../lib/types";

const catalog = PRODUCTS.map((p) => ({ id: p.id, name: p.name, category: p.category }));
const priceById = new Map(PRODUCTS.map((p) => [p.id, p.price_cents]));
const catById = new Map(PRODUCTS.map((p) => [p.id, p.category]));
const nameById = new Map(PRODUCTS.map((p) => [p.id, p.name]));
const validIds = new Set(PRODUCTS.map((p) => p.id));

// sorted by userId (alex < priya < sam) — only sam has a threshold
const members: Member[] = [
  { userId: "alex", weight: 2, excludedCategories: [], approvalThresholdCents: null },
  { userId: "priya", weight: 1, excludedCategories: ["alcohol"], approvalThresholdCents: null },
  { userId: "sam", weight: 1, excludedCategories: [], approvalThresholdCents: 4000 },
];

const CARTS = [
  "taco night for four — beef, tortilla chips, salsa, and tequila",
  "movie snacks and something to drink",
  "weekly restock: milk, eggs, bread, bananas",
  "cleaning supplies and paper towels",
  "caviar and champagne please",
];

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok " : "FAIL"} ${label}${detail ? " — " + detail : ""}`);
};
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

async function main() {
  for (const prompt of CARTS) {
    console.log(`\n▶ "${prompt}"`);
    const cart = await buildCart(prompt, catalog, RECENT_PURCHASE_NAMES);

    check("all ids in catalog", cart.items.every((i) => validIds.has(i.product_id)));
    check("qty positive int ≤ 12", cart.items.every((i) => Number.isInteger(i.qty) && i.qty > 0 && i.qty <= 12));
    check("no duplicate product_id", new Set(cart.items.map((i) => i.product_id)).size === cart.items.length);

    const lines: Line[] = cart.items.map((i) => ({
      itemId: i.product_id,
      category: catById.get(i.product_id)!,
      lineTotalCents: priceById.get(i.product_id)! * i.qty,
    }));
    for (const i of cart.items)
      console.log(`    · ${nameById.get(i.product_id)}${i.qty > 1 ? " ×" + i.qty : ""}  ${usd(priceById.get(i.product_id)! * i.qty)}`);
    if (cart.skipped.length) console.log(`    skipped: ${cart.skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}`);

    const { allocations, flagged } = computeSplit(lines, members);

    // 1. every line's allocations sum EXACTLY to the line total (integer cents)
    for (const line of lines) {
      const sum = allocations.filter((a) => a.itemId === line.itemId).reduce((s, a) => s + a.amountCents, 0);
      check(`line ${nameById.get(line.itemId)} sums to total`, sum === line.lineTotalCents, `${usd(sum)} vs ${usd(line.lineTotalCents)}`);
    }
    // 2. no negative allocation
    check("no negative shares", allocations.every((a) => a.amountCents >= 0));
    // 3. priya excluded from every alcohol line
    for (const line of lines.filter((l) => l.category === "alcohol")) {
      const priya = allocations.find((a) => a.itemId === line.itemId && a.userId === "priya");
      check(`priya excluded from alcohol (${nameById.get(line.itemId)})`, !priya || priya.amountCents === 0);
    }
    // 4. any line ≥ $40 is flagged to sam
    for (const line of lines.filter((l) => l.lineTotalCents >= 4000)) {
      const f = flagged.find((x) => x.itemId === line.itemId);
      check(`line ≥ $40 flagged to sam (${nameById.get(line.itemId)})`, !!f && f.approverId === "sam");
    }
    // 5. grand total conserved
    const grand = lines.reduce((s, l) => s + l.lineTotalCents, 0);
    const allocTotal = allocations.reduce((s, a) => s + a.amountCents, 0);
    check("grand total conserved", grand === allocTotal, `${usd(grand)} vs ${usd(allocTotal)}`);
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("smoke crashed:", e); process.exit(1); });

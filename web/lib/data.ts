// Seed data for the demo. Mirrors the Figma mock; swap for /api/dashboard later.

export const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Integer cents everywhere; format only at render.
export const fmtCents = (c: number) => money(c / 100);

export const household = { name: "Franklin St.", roommates: 4 };

export const totals = {
  spent: 893.9,
  budget: 1200,
  left: 306.1,
  usedPct: 74,
  owed: 0,
  saved: 47.2,
  rules: 5,
  needApproval: 2,
};

export type Person = {
  id: string;
  name: string;
  initials: string;
  color: string; // tailwind color utility suffix
  share: number;
  last4: string;
  pct: number;
};

// ids are the REAL seeded users.id UUIDs (not friendly slugs) so this fallback
// roster can drive login on its own: the mock auth stores a users.id in the
// cookie, and every downstream route keys on it as a FK. Keep these in sync with
// the seeded household — regenerate via `GET /api/users` if you re-seed.
export const people: Person[] = [
  { id: "9b364df5-a9da-4fe1-8014-50ec82ba1d4c", name: "Eren", initials: "ER", color: "groceries", share: 268.15, last4: "4242", pct: 30 },
  { id: "a6d24442-a5b6-4303-b4d4-f4601b6e4abf", name: "Shlok", initials: "SH", color: "meat", share: 241.3, last4: "8813", pct: 27 },
  { id: "002b83e3-d554-4619-8e56-ab797a489720", name: "Connor", initials: "CO", color: "alcohol", share: 205.75, last4: "5190", pct: 23 },
  { id: "e5066087-dd09-4c88-b51d-064f7cc8d33b", name: "John", initials: "JO", color: "household", share: 178.7, last4: "6607", pct: 20 },
];

export type Category = { name: string; amount: number; color: string; pct: number };

export const categories: Category[] = [
  { name: "Groceries", amount: 412.8, color: "groceries", pct: 46 },
  { name: "Meat", amount: 168.4, color: "meat", pct: 19 },
  { name: "Alcohol", amount: 96.0, color: "alcohol", pct: 11 },
  { name: "Household", amount: 88.9, color: "household", pct: 10 },
  { name: "Snacks", amount: 73.6, color: "snacks", pct: 8 },
  { name: "Cleaning", amount: 54.2, color: "cleaning", pct: 6 },
];

// One-tap canonical demo prompt (P1.3). Guarantees P2's normalized cache hits
// if the model is down, and produces the tequila-trips-Sam beat + a skipped line.
export const demoPrompt =
  "tequila, ribeye steak, tortilla chips, bananas, oat milk, paper towels";

// Offline fallback for /api/cart/build (P2) so the cart screen demos without the model.
export type CartItem = { id: string; name: string; qty: number; category: string; unit_price_cents: number };
export type CartResult = { purchaseId: string; items: CartItem[]; skipped: { name: string; reason: string }[] };
export const mockCart: CartResult = {
  purchaseId: "demo",
  items: [
    { id: "i1", name: "Casamigos Tequila", qty: 1, category: "alcohol", unit_price_cents: 5200 },
    { id: "i2", name: "Ribeye Steak", qty: 1, category: "meat", unit_price_cents: 3000 },
    { id: "i3", name: "Tortilla Chips", qty: 1, category: "snacks", unit_price_cents: 1000 },
    { id: "i4", name: "Bananas", qty: 1, category: "groceries", unit_price_cents: 300 },
    { id: "i5", name: "Oat Milk", qty: 1, category: "groceries", unit_price_cents: 550 },
  ],
  skipped: [{ name: "paper towels", reason: "bought Tuesday" }],
};

// Offline fallback for /api/purchase/[id]/split (P3) — tequila flagged to Sam.
export const mockSplitLines = mockCart.items.map((it) => ({
  itemId: it.id,
  name: it.name,
  category: it.category,
  lineTotalCents: it.unit_price_cents * it.qty,
  splits:
    it.category === "alcohol"
      ? [ // Priya excluded from alcohol → 3-way
          { userId: "ava", amountCents: 1734 },
          { userId: "mateo", amountCents: 1733 },
          { userId: "sam", amountCents: 1733 },
        ]
      : people.map((p, i) => ({
          userId: p.id,
          amountCents:
            Math.floor(it.unit_price_cents / people.length) +
            (i < it.unit_price_cents % people.length ? 1 : 0),
        })),
  ...(it.category === "alcohol"
    ? { flag: { approverId: "sam", rule: "over $40 approval threshold" } }
    : {}),
}));

// The line that trips a rule — drives the approval screen / two-device beat.
export const pendingApproval = {
  item: "Casamigos Tequila",
  category: "Alcohol",
  categoryColor: "alcohol",
  price: 52.0,
  addedBy: "Ava",
  approver: "sam",
  ruleText: "Anything over $40 needs your approval before it splits to you.",
  ruleSource: "ask me before big alcohol buys",
  yourShare: 13.0,
};

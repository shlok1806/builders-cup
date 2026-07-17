// Seed data for the demo. Mirrors the Figma mock; swap for /api/dashboard later.

export const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

export const people: Person[] = [
  { id: "ava", name: "Ava Chen", initials: "AC", color: "groceries", share: 268.15, last4: "4242", pct: 30 },
  { id: "mateo", name: "Mateo Ruiz", initials: "MR", color: "meat", share: 241.3, last4: "8813", pct: 27 },
  { id: "priya", name: "Priya Nair", initials: "PN", color: "alcohol", share: 205.75, last4: "5190", pct: 23 },
  { id: "sam", name: "Sam Okafor", initials: "SO", color: "household", share: 178.7, last4: "6607", pct: 20 },
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

// TEMPORARY stand-in for P3's seeded `products` / recent-purchase data.
// Replaced by real Supabase reads (see lib/data.ts) once Phase 0 lands.
// Categories are the six canonical ones from ARCHITECTURE.md §4:
//   groceries, alcohol, cleaning, meat, snacks, household
// Prices are integer cents. UUIDs are stable so the demo is deterministic.

export type Product = {
  id: string;
  name: string;
  category: Category;
  price_cents: number;
};

export type Category =
  | "groceries"
  | "alcohol"
  | "cleaning"
  | "meat"
  | "snacks"
  | "household";

export const HOUSEHOLD_ID = "11111111-1111-1111-1111-111111111111";

export const PRODUCTS: Product[] = [
  // groceries
  { id: "a0000000-0000-0000-0000-000000000001", name: "Whole Milk (1 gal)", category: "groceries", price_cents: 449 },
  { id: "a0000000-0000-0000-0000-000000000002", name: "Eggs (dozen)", category: "groceries", price_cents: 599 },
  { id: "a0000000-0000-0000-0000-000000000003", name: "Sourdough Bread", category: "groceries", price_cents: 549 },
  { id: "a0000000-0000-0000-0000-000000000004", name: "Bananas (bunch)", category: "groceries", price_cents: 219 },
  // snacks
  { id: "a0000000-0000-0000-0000-000000000010", name: "Tortilla Chips", category: "snacks", price_cents: 399 },
  { id: "a0000000-0000-0000-0000-000000000011", name: "Salsa", category: "snacks", price_cents: 449 },
  { id: "a0000000-0000-0000-0000-000000000012", name: "Trail Mix", category: "snacks", price_cents: 699 },
  { id: "a0000000-0000-0000-0000-000000000013", name: "Pretzels", category: "snacks", price_cents: 349 },
  // alcohol — the $52 line that trips the approval-threshold demo beat
  { id: "a0000000-0000-0000-0000-000000000020", name: "Tequila (750ml)", category: "alcohol", price_cents: 5200 },
  { id: "a0000000-0000-0000-0000-000000000021", name: "IPA 6-pack", category: "alcohol", price_cents: 1299 },
  // meat — the vegetarian-excluded line
  { id: "a0000000-0000-0000-0000-000000000030", name: "Ground Beef (1 lb)", category: "meat", price_cents: 799 },
  { id: "a0000000-0000-0000-0000-000000000031", name: "Chicken Breast (2 lb)", category: "meat", price_cents: 1099 },
  // cleaning — paper towels live here; pre-bought so dedupe skips them
  { id: "a0000000-0000-0000-0000-000000000040", name: "Paper Towels (6 rolls)", category: "cleaning", price_cents: 899 },
  { id: "a0000000-0000-0000-0000-000000000041", name: "Dish Soap", category: "cleaning", price_cents: 449 },
  // household — plain line; $10.00 keeps weighted split cents exact (§12)
  { id: "a0000000-0000-0000-0000-000000000050", name: "Trash Bags (box)", category: "household", price_cents: 1000 },
  { id: "a0000000-0000-0000-0000-000000000051", name: "Light Bulbs (4pk)", category: "household", price_cents: 749 },
];

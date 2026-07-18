// Data-access shim for the P2 agent routes.
//
// SWAP POINT: today this is backed by the in-memory fixture store so the two
// routes are testable in isolation (curl round-trips work). When Phase 0 lands
// — P1's lib/supabase.ts `admin()` client + P3's seeded tables — replace the
// bodies below with Supabase queries against products / purchases /
// purchase_items / policies. The exported signatures must NOT change, so the
// routes (app/api/*) never need to be touched.

import { randomUUID } from "crypto";
import {
  PRODUCTS,
  RECENT_PURCHASE_NAMES,
  HOUSEHOLD_ID,
  type Category,
} from "./catalog.fixture";

export type CatalogEntry = {
  id: string;
  name: string;
  category: Category;
  price_cents: number;
};

export type PurchaseItemInput = { product_id: string; qty: number };

export type PurchaseItemRow = {
  id: string;
  purchase_id: string;
  product_id: string;
  name: string;
  qty: number;
  unit_price_cents: number;
  category: Category;
};

export type PolicyRow = {
  id: string;
  user_id: string;
  household_id: string;
  type: string;
  params: Record<string, unknown>;
  source_text: string;
};

// --- in-memory store (fixture mode only) -----------------------------------
const purchases = new Map<
  string,
  { id: string; household_id: string; status: string; note: string; created_by: string; subtotal_cents: number }
>();
const purchaseItems = new Map<string, PurchaseItemRow[]>();
const policies: PolicyRow[] = [];

// --- reads ------------------------------------------------------------------

/** Full catalog the cart builder is constrained to. => Supabase: select * from products */
export async function getCatalog(): Promise<CatalogEntry[]> {
  return PRODUCTS.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price_cents: p.price_cents,
  }));
}

/**
 * Recent purchase item names for the household (last 14 days), fed to the cart
 * builder for dedupe. => Supabase: purchase_items joined to purchases where
 * household_id = ? and purchases.created_at > now() - interval '14 days'.
 */
export async function getRecentPurchaseNames(
  _householdId: string = HOUSEHOLD_ID,
): Promise<string[]> {
  return [...RECENT_PURCHASE_NAMES];
}

// --- writes -----------------------------------------------------------------

/** => Supabase: insert into purchases (status:'building', ...) returning id */
export async function createBuildingPurchase(input: {
  householdId?: string;
  createdBy: string;
  note: string;
}): Promise<string> {
  const id = randomUUID();
  purchases.set(id, {
    id,
    household_id: input.householdId ?? HOUSEHOLD_ID,
    status: "building",
    note: input.note,
    created_by: input.createdBy,
    subtotal_cents: 0,
  });
  purchaseItems.set(id, []);
  return id;
}

/**
 * Inserts one purchase_items row per validated cart item, copying name /
 * category / unit_price_cents from the catalog, then stores subtotal_cents on
 * the purchase. Returns the created rows + subtotal.
 * => Supabase: insert into purchase_items (...); update purchases set subtotal_cents.
 */
export async function insertPurchaseItems(
  purchaseId: string,
  items: PurchaseItemInput[],
): Promise<{ rows: PurchaseItemRow[]; subtotalCents: number }> {
  const catalog = await getCatalog();
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const rows: PurchaseItemRow[] = [];
  let subtotalCents = 0;

  for (const item of items) {
    const product = byId.get(item.product_id);
    if (!product) continue; // defense in depth; buildCart already rejects unknown ids
    const row: PurchaseItemRow = {
      id: randomUUID(),
      purchase_id: purchaseId,
      product_id: product.id,
      name: product.name,
      qty: item.qty,
      unit_price_cents: product.price_cents,
      category: product.category,
    };
    rows.push(row);
    subtotalCents += product.price_cents * item.qty;
  }

  purchaseItems.set(purchaseId, rows);
  const purchase = purchases.get(purchaseId);
  if (purchase) purchase.subtotal_cents = subtotalCents;

  return { rows, subtotalCents };
}

/** => Supabase: insert into policies (...) returning * */
export async function insertPolicy(input: {
  userId: string;
  householdId?: string;
  type: string;
  params: Record<string, unknown>;
  source_text: string;
}): Promise<PolicyRow> {
  const row: PolicyRow = {
    id: randomUUID(),
    user_id: input.userId,
    household_id: input.householdId ?? HOUSEHOLD_ID,
    type: input.type,
    params: input.params,
    source_text: input.source_text,
  };
  policies.push(row);
  return row;
}

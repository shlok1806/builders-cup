// F2 — Agentic cart builder route (Call A).
// POST { text } -> { purchaseId, items:[{id,name,qty,category,unit_price_cents}], skipped }
//
// Loads the catalog + recent purchase names (dedupe), asks the agent to build a
// catalog-constrained cart, persists a `building` purchase + its line items,
// and returns the enriched cart for the split view.

import { NextResponse } from "next/server";
import { buildCart } from "@/lib/openai";
import {
  getCatalog,
  getRecentPurchaseNames,
  createBuildingPurchase,
  insertPurchaseItems,
} from "@/lib/data";
import { HOUSEHOLD_ID } from "@/lib/catalog.fixture";

export async function POST(req: Request) {
  let body: { text?: string; userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  const createdBy = body.userId ?? "seed-user"; // no auth (ARCHITECTURE §2)

  try {
    const catalog = await getCatalog();
    const recentNames = await getRecentPurchaseNames(HOUSEHOLD_ID);

    const { items, skipped } = await buildCart(
      text,
      catalog.map((c) => ({ id: c.id, name: c.name, category: c.category })),
      recentNames,
    );

    const purchaseId = await createBuildingPurchase({
      householdId: HOUSEHOLD_ID,
      createdBy,
      note: text,
    });
    const { rows } = await insertPurchaseItems(purchaseId, items);

    return NextResponse.json({
      purchaseId,
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        qty: r.qty,
        category: r.category,
        unit_price_cents: r.unit_price_cents,
      })),
      skipped,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

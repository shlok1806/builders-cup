// P2 — the entire LLM surface of Cartel: exactly two OpenAI calls.
//   Call A (buildCart)     — free text -> catalog-constrained, deduped cart (F2)
//   Call B (compilePolicy) — one rule sentence -> one structured policy (F3)
//
// Both use OpenAI STRUCTURED OUTPUTS (json_schema response format, strict:true)
// via the zod helper — not plain json mode. Every call is:
//     validate  ->  re-ask once  ->  cached fallback
// The cached fallback is keyed to the EXACT demo prompt string so the demo
// survives a dead model / dead network (ARCHITECTURE.md §6, §11).
//
// Integer cents / integer qty everywhere. The cart builder may only emit
// catalog product_ids; an invented id is rejected and re-asked.

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

const MODEL = "gpt-4o-2024-08-06"; // supports strict structured outputs

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

// ---------------------------------------------------------------------------
// Types (match the P2 contract in docs/superpowers/plans/teammate-P2-agent.md)
// ---------------------------------------------------------------------------

export type CatalogEntry = { id: string; name: string; category: string };

export type BuildCartResult = {
  items: { product_id: string; qty: number }[];
  skipped: { name: string; reason: string }[];
};

export const POLICY_TYPES = [
  "exclude_category",
  "approval_threshold",
  "split_weight",
] as const;
export type PolicyType = (typeof POLICY_TYPES)[number];

export type CompilePolicyResult = {
  type: PolicyType;
  params: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Schemas — handed directly to the API AND used to validate the parsed output.
// ---------------------------------------------------------------------------

// Strict structured outputs require every field to be required (nullable is
// allowed, .optional()/.default() is not). Empty arrays are fine.
const CartSchema = z.object({
  items: z.array(
    z.object({
      product_id: z.string(),
      qty: z.number().int().positive(),
    }),
  ),
  skipped: z.array(z.object({ name: z.string(), reason: z.string() })),
});

// The policy enum is exactly three. params is a flat object; we validate its
// per-type shape after parse (structured outputs can't express a discriminated
// union cleanly across all three param shapes, so we keep params open in the
// schema and tighten it in validatePolicyParams()).
const PolicySchema = z.object({
  type: z.enum(POLICY_TYPES),
  params: z.object({
    category: z.string().nullable(),
    amount_cents: z.number().int().nullable(),
    weight: z.number().int().nullable(),
  }),
});

// ---------------------------------------------------------------------------
// Cached fallbacks — keyed to the EXACT demo prompt strings.
// ---------------------------------------------------------------------------

// Catalog ids referenced here mirror lib/catalog.fixture.ts. Kept as string
// literals (not imported) so this module has zero data-layer dependency.
const CART_FALLBACKS: Record<string, BuildCartResult> = {
  "restock + snacks for Friday": {
    items: [
      { product_id: "a0000000-0000-0000-0000-000000000001", qty: 1 }, // milk
      { product_id: "a0000000-0000-0000-0000-000000000002", qty: 1 }, // eggs
      { product_id: "a0000000-0000-0000-0000-000000000003", qty: 1 }, // bread
      { product_id: "a0000000-0000-0000-0000-000000000010", qty: 2 }, // chips
      { product_id: "a0000000-0000-0000-0000-000000000011", qty: 1 }, // salsa
      { product_id: "a0000000-0000-0000-0000-000000000012", qty: 1 }, // trail mix
      { product_id: "a0000000-0000-0000-0000-000000000020", qty: 1 }, // tequila ($52)
      { product_id: "a0000000-0000-0000-0000-000000000030", qty: 1 }, // ground beef
      { product_id: "a0000000-0000-0000-0000-000000000050", qty: 1 }, // trash bags ($10 plain line)
    ],
    skipped: [
      { name: "Paper Towels (6 rolls)", reason: "bought Tuesday" },
    ],
  },
};

const POLICY_FALLBACKS: Record<string, CompilePolicyResult> = {
  "don't split alcohol to me": {
    type: "exclude_category",
    params: { category: "alcohol" },
  },
  "never split alcohol to me": {
    type: "exclude_category",
    params: { category: "alcohol" },
  },
  "I'm vegetarian, don't charge me for meat": {
    type: "exclude_category",
    params: { category: "meat" },
  },
  "anything over $40 needs my approval": {
    type: "approval_threshold",
    params: { amount_cents: 4000 },
  },
  "I earn more so give me a double share": {
    type: "split_weight",
    params: { weight: 2 },
  },
};

export const FALLBACKS = {
  buildCart: CART_FALLBACKS,
  compilePolicy: POLICY_FALLBACKS,
};

// ---------------------------------------------------------------------------
// Call A — cart builder (F2)
// ---------------------------------------------------------------------------

const CART_SYSTEM =
  "You build a shopping cart from a FIXED catalog. Only use product IDs that " +
  "appear in the provided catalog — never invent an ID or a product. Skip " +
  "anything already in the recent-purchases list and give a short reason. " +
  "Choose sensible quantities. Return JSON only.";

export async function buildCart(
  text: string,
  catalog: CatalogEntry[],
  recentNames: string[],
): Promise<BuildCartResult> {
  const validIds = new Set(catalog.map((c) => c.id));
  const userMsg = JSON.stringify({
    request: text,
    catalog,
    recent_purchases: recentNames,
  });

  const attempt = async (extraNote?: string): Promise<BuildCartResult> => {
    const completion = await client().chat.completions.create({
      model: MODEL,
      response_format: zodResponseFormat(CartSchema, "cart"),
      messages: [
        { role: "system", content: CART_SYSTEM + (extraNote ? "\n" + extraNote : "") },
        { role: "user", content: userMsg },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = CartSchema.parse(JSON.parse(raw));
    // Reject any product_id not in the catalog.
    const bad = parsed.items.filter((i) => !validIds.has(i.product_id));
    if (bad.length > 0) {
      throw new Error(
        `invented product_id(s): ${bad.map((b) => b.product_id).join(", ")}`,
      );
    }
    return parsed;
  };

  try {
    return await attempt();
  } catch (err) {
    // Re-ask once, telling the model exactly what went wrong.
    try {
      return await attempt(
        `Your previous answer was invalid (${(err as Error).message}). ` +
          "Use ONLY product_ids present in the catalog.",
      );
    } catch {
      const fallback = CART_FALLBACKS[text];
      if (fallback) return fallback;
      throw new Error(
        `buildCart failed after re-ask and no cached fallback for: ${JSON.stringify(text)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Call B — policy compiler (F3)
// ---------------------------------------------------------------------------

const POLICY_SYSTEM =
  "You compile ONE household spending rule into ONE JSON policy object. " +
  "Choose exactly one type from: exclude_category, approval_threshold, " +
  "split_weight. Fill only the params relevant to that type: " +
  "exclude_category -> {category}; approval_threshold -> {amount_cents} " +
  "(integer cents); split_weight -> {weight} (integer). Leave the other " +
  "params null. Return JSON only.";

/** Tightens the flat params object into the canonical per-type shape. */
function validatePolicyParams(
  type: PolicyType,
  params: { category: string | null; amount_cents: number | null; weight: number | null },
): Record<string, unknown> {
  switch (type) {
    case "exclude_category":
      if (!params.category) throw new Error("exclude_category needs a category");
      return { category: params.category.toLowerCase() };
    case "approval_threshold":
      if (params.amount_cents == null || !Number.isInteger(params.amount_cents))
        throw new Error("approval_threshold needs integer amount_cents");
      return { amount_cents: params.amount_cents };
    case "split_weight":
      if (params.weight == null || !Number.isInteger(params.weight))
        throw new Error("split_weight needs integer weight");
      return { weight: params.weight };
  }
}

export async function compilePolicy(
  sentence: string,
): Promise<CompilePolicyResult> {
  const attempt = async (extraNote?: string): Promise<CompilePolicyResult> => {
    const completion = await client().chat.completions.create({
      model: MODEL,
      response_format: zodResponseFormat(PolicySchema, "policy"),
      messages: [
        { role: "system", content: POLICY_SYSTEM + (extraNote ? "\n" + extraNote : "") },
        { role: "user", content: sentence },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = PolicySchema.parse(JSON.parse(raw));
    const params = validatePolicyParams(parsed.type, parsed.params);
    return { type: parsed.type, params };
  };

  try {
    return await attempt();
  } catch (err) {
    try {
      return await attempt(
        `Your previous answer was invalid (${(err as Error).message}). ` +
          "Pick exactly one type and fill only its params.",
      );
    } catch {
      const fallback = POLICY_FALLBACKS[sentence];
      if (fallback) return fallback;
      throw new Error(
        `compilePolicy failed after re-ask and no cached fallback for: ${JSON.stringify(sentence)}`,
      );
    }
  }
}

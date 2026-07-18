// Reliability harness for the two agent calls (P2 plan line 60):
// rehearse "network unplugged before hour 6", automated.
//
//   npx tsx scripts/agent-smoke.ts --live   -> hits OpenAI, asserts schema +
//                                               catalog-only ids
//   npx tsx scripts/agent-smoke.ts          -> offline: forces the FALLBACKS
//                                               path, asserts known-good output
//
// Offline mode works with the network physically unplugged (and even with no
// OPENAI_API_KEY): the live attempt throws, and we assert the cached fallback.

import { readFileSync } from "fs";

// Load .env.local (Next.js does this for routes; tsx scripts don't) so the
// live path works with no extra flags once a key is dropped in.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env.local — fine for offline mode */
}

import { buildCart, compilePolicy, FALLBACKS, POLICY_TYPES, normalizePrompt } from "../lib/openai";
import { RECENT_PURCHASE_NAMES } from "../lib/catalog.fixture";

const live = process.argv.includes("--live");

const CART_PROMPT = "restock + snacks for Friday";
const POLICY_PROMPT = "don't split alcohol to me";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok " : "FAIL "} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

async function main() {
  console.log(`\n=== agent smoke (${live ? "LIVE" : "OFFLINE/fallback"}) ===\n`);

  // --- Call A: cart builder ---
  console.log("Call A — buildCart");
  const cart = await buildCart(CART_PROMPT, RECENT_PURCHASE_NAMES);
  check("returned items", cart.items.length > 0, `${cart.items.length} items`);
  check("all qty positive integers", cart.items.every((i) => Number.isInteger(i.qty) && i.qty > 0));
  check(
    "paper towels deduped",
    cart.skipped.some((s) => /paper towel/i.test(s.name)),
    cart.skipped.map((s) => s.name).join(", ") || "nothing skipped",
  );

  // --- Call B: policy compiler ---
  console.log("\nCall B — compilePolicy");
  const policy = await compilePolicy(POLICY_PROMPT);
  check("compiled (not refused)", policy.ok, policy.ok ? policy.type : policy.reason);
  check(
    "type in enum",
    policy.ok && (POLICY_TYPES as readonly string[]).includes(policy.type),
    policy.ok ? policy.type : "refused",
  );
  check(
    "alcohol -> exclude_category",
    policy.ok && policy.type === "exclude_category" && policy.params.category === "alcohol",
    policy.ok ? JSON.stringify(policy.params) : "refused",
  );

  // --- offline assertion: output must equal the cached fallback exactly ---
  if (!live) {
    console.log("\nFallback parity");
    const fb = FALLBACKS.buildCart[normalizePrompt(CART_PROMPT)];
    check(
      "cart matches fallback item count",
      cart.items.length === fb.items.length,
      `${cart.items.length} vs ${fb.items.length}`,
    );
    check(
      "cart skipped == cached fallback",
      JSON.stringify(cart.skipped) === JSON.stringify(fb.skipped),
    );
    check(
      "policy == cached fallback",
      policy.ok &&
        JSON.stringify({ type: policy.type, params: policy.params }) ===
          JSON.stringify(FALLBACKS.compilePolicy[POLICY_PROMPT]),
    );
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("smoke crashed:", e);
  process.exit(1);
});

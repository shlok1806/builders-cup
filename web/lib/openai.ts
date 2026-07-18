import OpenAI from 'openai'

// Call A — the cart builder. The LLM's ONLY job here is language: turn free text
// into a list of needs {name, category, qty} and note what it skipped. It never
// sees prices, never picks a vendor, never touches money — deterministic code
// (getOffers + deals) resolves each need to the cheapest real offer afterwards.
// A normalized fallback map guarantees the demo prompt works even if the API is
// down, mirroring the discipline the split engine already relies on.

export const CATEGORIES = [
  'groceries',
  'alcohol',
  'cleaning',
  'meat',
  'snacks',
  'household',
] as const
export type Category = (typeof CATEGORIES)[number]

export type Need = { name: string; category: Category; qty: number }
export type Skipped = { name: string; reason: string }
export type CartResult = { items: Need[]; skipped: Skipped[] }

const SYSTEM = `You turn a household's plain-English shopping request into a structured cart.
Rules:
- Output only needs the house actually asked for, as {name, category, qty}.
- category MUST be one of: ${CATEGORIES.join(', ')}.
- If a requested item appears in recentlyBought, DO NOT add it — put it in "skipped" with a short reason (e.g. "bought recently").
- Keep names generic and searchable (e.g. "paper towels", not a brand SKU).`

const CART_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'skipped'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'category', 'qty'],
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES as unknown as string[] },
          qty: { type: 'integer', minimum: 1 },
        },
      },
    },
    skipped: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'reason'],
        properties: {
          name: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const

export function normalizePrompt(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Known-good parsed carts keyed on the normalized prompt. The demo chip sends the
// exact string, so the cache always hits when the model is unavailable.
const CART_FALLBACKS: Record<string, CartResult> = {
  'restock + snacks for friday': {
    items: [
      { name: 'coffee', category: 'groceries', qty: 1 },
      { name: 'tortilla chips', category: 'snacks', qty: 2 },
      { name: 'dish soap', category: 'cleaning', qty: 1 },
      { name: 'tequila', category: 'alcohol', qty: 1 },
    ],
    skipped: [{ name: 'paper towels', reason: 'bought recently' }],
  },
}

const client = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// USD per 1M tokens, per model (OpenAI list prices; update if they change).
const PRICE_PER_1M: Record<string, { in: number; out: number }> = {
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
}

type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }

// Logs token counts + an estimated cost for one completion so you can see, per
// call, how many tokens each LLM step burned and roughly what it cost.
function logUsage(call: string, model: string, usage: Usage | undefined) {
  const inTok = usage?.prompt_tokens ?? 0
  const outTok = usage?.completion_tokens ?? 0
  const rate = PRICE_PER_1M[model]
  const cost = rate ? (inTok * rate.in + outTok * rate.out) / 1e6 : 0
  console.log(
    `[openai] ${call} · ${model} · ${inTok} in + ${outTok} out = ${inTok + outTok} tok` +
      (rate ? ` · ~$${cost.toFixed(6)}` : ' · (price unknown)')
  )
}

// Logged when an LLM call is skipped or fails and the deterministic fallback runs
// — so a fallback result is never mistaken for a real model response.
function logFallback(call: string, reason: string) {
  console.warn(`[openai] ${call} → FALLBACK (no LLM): ${reason}`)
}

export async function buildCart(text: string, recentNames: string[]): Promise<CartResult> {
  const key = normalizePrompt(text)
  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('no OPENAI_API_KEY')
    const res = await client().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify({ request: text, recentlyBought: recentNames }) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'cart', strict: true, schema: CART_SCHEMA },
      },
    })
    logUsage('buildCart', 'gpt-4o-mini', res.usage)
    const content = res.choices[0]?.message?.content
    if (!content) throw new Error('empty completion')
    const parsed = JSON.parse(content) as CartResult
    if (!Array.isArray(parsed.items) || !Array.isArray(parsed.skipped)) {
      throw new Error('bad shape')
    }
    // Drop anything the model still slipped through against the recent list.
    const recent = new Set(recentNames.map((n) => n.toLowerCase()))
    parsed.items = parsed.items.filter((i) => !recent.has(i.name.toLowerCase()))
    return parsed
  } catch (e) {
    logFallback('buildCart', (e as Error).message)
    return CART_FALLBACKS[key] ?? { items: [], skipped: [] }
  }
}

// Call A′ — the cart COMPOSER. buildCart parses one request into needs; the
// composer is the agent that decides the final cart. It is handed real, already-
// sourced facts — each candidate's cheapest price, its savings vs the next vendor,
// whether it's predicted to run out soon, whether it was just bought — plus the
// remaining monthly budget, and it chooses WHAT to buy, HOW MANY, and WHY. It still
// never invents a price or picks a vendor: it may only select candidates by name;
// deterministic code prices every chosen line afterwards. composeHeuristic is the
// no-API fallback so the demo composes intelligently even with the key pulled.

export type ComposeCandidate = {
  name: string
  category: string
  unitPriceCents: number // cheapest in-stock offer we sourced (fact, not asserted)
  savingsCents: number // runner-up − cheapest; the "deal" size
  offersCount: number
  dueSoon: boolean // predicted to run out within the restock horizon
  boughtRecently: boolean
}
export type ComposeContext = {
  request?: string // the free-text ask, if any (absent for autonomous restock)
  budgetRemainingCents: number // 0 = no budget set → treat as unlimited
  candidates: ComposeCandidate[]
}
export type ComposedItem = { name: string; qty: number; reason: string | null }
export type ComposeDecision = { items: ComposedItem[]; skipped: Skipped[] }

const COMPOSE_SYSTEM = `You are a household's procurement agent composing a shopping cart.
You are given candidate items with REAL sourced facts (cheapest price in cents, savings vs the next vendor, whether each is predicted to run out soon, whether it was bought recently) and the household's remaining monthly budget in cents.
Decide the smartest cart:
- Prefer items that are running low (dueSoon) or explicitly requested.
- DO NOT re-buy something marked boughtRecently — put it in "skipped" with a short reason.
- Choose sensible quantities (usually 1; more only if clearly implied).
- Keep the cart's total (sum of unitPriceCents × qty) within budgetRemainingCents when it is > 0; if you must cut, drop the lowest-priority items and skip them with reason "trimmed to stay within budget".
- You may ONLY choose items by their exact candidate name. Never invent an item or a price.
Give each chosen item a one-phrase reason (e.g. "running low", "cheapest of 3", "for Friday").`

const COMPOSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'skipped'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'qty', 'reason'],
        properties: {
          name: { type: 'string' },
          qty: { type: 'integer', minimum: 1 },
          reason: { type: ['string', 'null'] },
        },
      },
    },
    skipped: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'reason'],
        properties: { name: { type: 'string' }, reason: { type: 'string' } },
      },
    },
  },
} as const

// Deterministic composer — the demo's safety net with NO OpenAI key. Ranks by
// running-low first, then by deal size (bigger savings), and greedily fills the
// cart while staying within the remaining budget. Same ordering the prompt asks
// the model for, so behavior is coherent whether or not the API is reachable.
export function composeHeuristic(ctx: ComposeContext): ComposeDecision {
  const ranked = ctx.candidates
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        Number(b.c.dueSoon) - Number(a.c.dueSoon) ||
        b.c.savingsCents - a.c.savingsCents ||
        a.i - b.i
    )
    .map((x) => x.c)

  const items: ComposedItem[] = []
  const skipped: Skipped[] = []
  let total = 0
  for (const c of ranked) {
    if (c.boughtRecently) {
      skipped.push({ name: c.name, reason: 'bought recently' })
      continue
    }
    if (ctx.budgetRemainingCents > 0 && total + c.unitPriceCents > ctx.budgetRemainingCents) {
      skipped.push({ name: c.name, reason: 'trimmed to stay within budget' })
      continue
    }
    total += c.unitPriceCents
    items.push({ name: c.name, qty: 1, reason: c.dueSoon ? 'running low' : null })
  }
  return { items, skipped }
}

export async function composeCart(ctx: ComposeContext): Promise<ComposeDecision> {
  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('no OPENAI_API_KEY')
    const res = await client().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: COMPOSE_SYSTEM },
        { role: 'user', content: JSON.stringify(ctx) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'composed_cart', strict: true, schema: COMPOSE_SCHEMA },
      },
    })
    logUsage('composeCart', 'gpt-4o-mini', res.usage)
    const content = res.choices[0]?.message?.content
    if (!content) throw new Error('empty completion')
    const parsed = JSON.parse(content) as ComposeDecision
    if (!Array.isArray(parsed.items) || !Array.isArray(parsed.skipped)) throw new Error('bad shape')
    // The model may only pick real candidates — drop anything invented, and clamp qty.
    const names = new Set(ctx.candidates.map((c) => c.name.toLowerCase()))
    parsed.items = parsed.items
      .filter((i) => names.has(i.name.toLowerCase()) && Number.isFinite(i.qty))
      .map((i) => ({ name: i.name, qty: Math.max(1, Math.floor(i.qty)), reason: i.reason ?? null }))
    return parsed
  } catch (e) {
    logFallback('composeCart', (e as Error).message)
    return composeHeuristic(ctx)
  }
}

// Call B — the policy compiler. Same discipline as buildCart: the LLM's only job
// is language — turn ONE plain-English house rule into ONE structured policy the
// split engine can apply. It runs at rule-creation time, never on the money path.
// A cached-fallback + deterministic keyword compiler keeps it working with the
// API (or the key) unavailable, mirroring the cart builder.

export const POLICY_TYPES = ['exclude_category', 'approval_threshold', 'split_weight'] as const
export type PolicyType = (typeof POLICY_TYPES)[number]
export type CompilePolicyResult = { type: PolicyType; params: Record<string, unknown> }

// The fixed catalog categories a policy may exclude (matches the seeded catalog).
const CATALOG_CATEGORIES = ['groceries', 'meat', 'alcohol', 'household', 'snacks', 'cleaning']

const CATEGORY_WORDS: [RegExp, string][] = [
  [/alcohol|booze|beer|wine|liquor|tequila|vodka|whiskey|drinks?/, 'alcohol'],
  [/meat|vegetarian|vegan|beef|steak|chicken|pork|bacon/, 'meat'],
  [/snacks?|chips|candy|soda|junk/, 'snacks'],
  [/cleaning|cleaner|detergent|soap|sponge/, 'cleaning'],
  [/household|paper towels?|toiletr|supplies/, 'household'],
  [/grocer/, 'groceries'],
]

// Deterministic keyword compiler — the demo's safety net so policies compile with
// NO OpenAI key and for phrasings not in the exact-match table below.
// Order matters: threshold (has an amount) -> weight (share/double) -> exclude.
export function heuristicPolicy(sentence: string): CompilePolicyResult | null {
  const s = sentence.toLowerCase()

  // approval_threshold: an amount + an "ask/approve/over" intent.
  const amt = s.match(/\$\s?(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:dollars|bucks)/)
  if (amt && /(approv|ask me|check with me|confirm|over|above|more than|greater than|threshold|limit)/.test(s)) {
    const dollars = parseFloat(amt[1] ?? amt[2])
    if (dollars > 0) return { type: 'approval_threshold', params: { amount_cents: Math.round(dollars * 100) } }
  }

  // split_weight: "double/triple/twice" or "Nx / N shares", with a share intent.
  if (/(share|weight|use more|pay more|bigger|larger|double|triple|twice|extra)/.test(s)) {
    const word = /(double|twice)/.test(s) ? 2 : /triple/.test(s) ? 3 : null
    const num = s.match(/(\d+)\s*(?:x\b|times|shares?)/)
    const w = word ?? (num ? parseInt(num[1], 10) : null)
    if (w && w >= 1) return { type: 'split_weight', params: { weight: w } }
  }

  // exclude_category: a category word + an exclusion intent.
  const cat = CATEGORY_WORDS.find(([re]) => re.test(s))?.[1]
  // Intent words must signal EXCLUSION. Bare "split"/"charge" are inclusive
  // ("charge me for alcohol") — only their negated forms below count.
  if (cat && /(don'?t|do not|never|no\b|not\b|exclude|skip|without|leave me out|don'?t (?:split|charge)|no (?:split|charge))/.test(s)) {
    return { type: 'exclude_category', params: { category: cat } }
  }

  return null
}

const POLICY_SYSTEM = `You compile ONE household spending rule into ONE JSON policy object.
Choose exactly one type from: ${POLICY_TYPES.join(', ')}.
Fill only the params relevant to that type; leave the others null:
- exclude_category -> { category } (MUST be one of: ${CATALOG_CATEGORIES.join(', ')} — pick the closest)
- approval_threshold -> { amount_cents } (integer cents)
- split_weight -> { weight } (integer)`

const POLICY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'params'],
  properties: {
    type: { type: 'string', enum: POLICY_TYPES as unknown as string[] },
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['category', 'amount_cents', 'weight'],
      properties: {
        category: { type: ['string', 'null'] },
        amount_cents: { type: ['integer', 'null'] },
        weight: { type: ['integer', 'null'] },
      },
    },
  },
} as const

// Tightens the model's flat params into the canonical per-type shape and, for
// exclude_category, normalizes synonyms (beef->meat, wine->alcohol) to a real
// catalog category so the exclusion actually fires at split time.
function validatePolicyParams(
  type: PolicyType,
  params: { category: string | null; amount_cents: number | null; weight: number | null },
): Record<string, unknown> {
  switch (type) {
    case 'exclude_category': {
      if (!params.category) throw new Error('exclude_category needs a category')
      const raw = params.category.toLowerCase()
      const canon = CATALOG_CATEGORIES.includes(raw) ? raw : CATEGORY_WORDS.find(([re]) => re.test(raw))?.[1]
      if (!canon) throw new Error(`unknown category: ${raw}`)
      return { category: canon }
    }
    case 'approval_threshold':
      if (params.amount_cents == null || !Number.isInteger(params.amount_cents) || params.amount_cents <= 0)
        throw new Error('approval_threshold needs a positive integer amount_cents')
      return { amount_cents: params.amount_cents }
    case 'split_weight':
      if (params.weight == null || !Number.isInteger(params.weight) || params.weight < 1)
        throw new Error('split_weight needs an integer weight >= 1')
      return { weight: params.weight }
  }
}

// Exact-match cache keyed on the raw sentence (the seeded/demo rules). Anything
// else falls through to heuristicPolicy.
const POLICY_FALLBACKS: Record<string, CompilePolicyResult> = {
  "don't split alcohol to me": { type: 'exclude_category', params: { category: 'alcohol' } },
  'never split alcohol to me': { type: 'exclude_category', params: { category: 'alcohol' } },
  "I'm vegetarian, don't charge me for meat": { type: 'exclude_category', params: { category: 'meat' } },
  'anything over $40 needs my approval': { type: 'approval_threshold', params: { amount_cents: 4000 } },
  'I earn more so give me a double share': { type: 'split_weight', params: { weight: 2 } },
}

export async function compilePolicy(sentence: string): Promise<CompilePolicyResult> {
  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('no OPENAI_API_KEY')
    const res = await client().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: POLICY_SYSTEM },
        { role: 'user', content: sentence },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'policy', strict: true, schema: POLICY_SCHEMA },
      },
    })
    logUsage('compilePolicy', 'gpt-4o-mini', res.usage)
    const content = res.choices[0]?.message?.content
    if (!content) throw new Error('empty completion')
    const parsed = JSON.parse(content) as {
      type: PolicyType
      params: { category: string | null; amount_cents: number | null; weight: number | null }
    }
    if (!(POLICY_TYPES as readonly string[]).includes(parsed.type)) throw new Error(`bad type: ${parsed.type}`)
    return { type: parsed.type, params: validatePolicyParams(parsed.type, parsed.params) }
  } catch (e) {
    logFallback('compilePolicy', (e as Error).message)
    const fallback = POLICY_FALLBACKS[sentence] ?? heuristicPolicy(sentence)
    if (fallback) return fallback
    throw new Error(`compilePolicy failed and no fallback for: ${JSON.stringify(sentence)}`)
  }
}

// Grouped fallbacks for the offline reliability harness (scripts/agent-smoke.ts).
export const FALLBACKS = { buildCart: CART_FALLBACKS, compilePolicy: POLICY_FALLBACKS }

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
const FALLBACKS: Record<string, CartResult> = {
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
  } catch {
    return FALLBACKS[key] ?? { items: [], skipped: [] }
  }
}

// Trusted-store allowlist. Two jobs:
//   1. Safety — the agent only ever sources from retailers we vet, never a
//      gray-market seller, counterfeit shop, or no-name dropshipper.
//   2. Control — a household can narrow this to just the stores they want
//      (persisted in households.allowed_vendors; NULL = this default set).
// SerpAPI `source` strings are messy ("Walmart - Seller", "Amazon.com", "Target"),
// so vendors are matched by normalized substring, not exact equality.

export const DEFAULT_ALLOWLIST = [
  'Walmart', 'Target', 'Amazon', 'Costco', "Sam's Club", "BJ's",
  'Kroger', 'Safeway', 'Albertsons', 'Publix', 'Whole Foods', 'Trader Joe',
  'Aldi', 'Wegmans', 'Meijer', 'Food Lion', 'Giant', 'Stop & Shop',
  'H-E-B', 'Ralphs', 'Vons', 'Instacart', 'Home Depot', 'Lowe',
  'Ace Hardware', 'Walgreens', 'CVS', 'Rite Aid', 'Best Buy', 'Staples',
  'Office Depot', 'Total Wine', 'BevMo', 'Drizly', 'IKEA', 'Chewy',
  'Petco', 'PetSmart', 'Macy', 'Kohl',
]

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// A vendor is allowed if its normalized name contains an allowlist entry — e.g.
// "walmart marketplace" ⊇ "walmart". Substring (not equality) absorbs SerpAPI's
// "- Seller" / ".com" suffixes. Empty vendor → rejected.
export function isVendorAllowed(vendor: string, allowlist: string[] = DEFAULT_ALLOWLIST): boolean {
  const v = norm(vendor)
  if (!v) return false
  return allowlist.some((a) => {
    const n = norm(a)
    return n.length > 0 && (v === n || v.includes(n))
  })
}

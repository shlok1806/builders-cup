import { it, expect } from 'vitest'
import { compilePolicy } from './openai'

// vitest runs with no OPENAI_API_KEY, so compilePolicy takes the deterministic
// offline path (exact-match table + heuristic). These lock the demo-critical
// contract: supported intents compile, out-of-scope rules are REFUSED (ok:false)
// — never force-fit into a wrong policy.

it('compiles the three supported rule shapes', async () => {
  await expect(compilePolicy('no alcohol for me')).resolves.toMatchObject({ ok: true, type: 'exclude_category', params: { category: 'alcohol' } })
  await expect(compilePolicy('ask me before anything over $40')).resolves.toMatchObject({ ok: true, type: 'approval_threshold', params: { amount_cents: 4000 } })
  await expect(compilePolicy('give me a 3x share')).resolves.toMatchObject({ ok: true, type: 'split_weight', params: { weight: 3 } })
})

it('refuses out-of-scope rules instead of mangling them', async () => {
  for (const s of ['cap my monthly spend at $200', 'split everything evenly', 'only split groceries on weekends']) {
    const r = await compilePolicy(s)
    expect(r.ok, `"${s}" should be refused`).toBe(false)
  }
})

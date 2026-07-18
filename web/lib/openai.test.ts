import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const openAiHarness = vi.hoisted(() => ({
  createCompletion: vi.fn(),
}))

vi.mock('openai', () => {
  class OpenAIMock {
    chat = {
      completions: {
        create: openAiHarness.createCompletion,
      },
    }
  }

  return { default: OpenAIMock }
})

import { buildCart } from './openai'

describe('buildCart', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    openAiHarness.createCompletion.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('accounts for every comma-separated request, preserving model itemization and logging the parsed cart', async () => {
    const request = 'tequila, steak, chicken'
    const items = [
      { name: 'tequila', category: 'alcohol', qty: 1 },
      { name: 'steak', category: 'meat', qty: 1 },
      { name: 'chicken', category: 'meat', qty: 1 },
    ]
    const skipped: never[] = []
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    openAiHarness.createCompletion.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ items, skipped }) } }],
    })

    await expect(buildCart(request, [])).resolves.toEqual({ items, skipped })

    expect(openAiHarness.createCompletion).toHaveBeenCalledOnce()
    const completion = openAiHarness.createCompletion.mock.calls[0]?.[0]
    expect(completion.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('Commas, semicolons, and newlines commonly separate distinct requested items.'),
        }),
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('Account for every requested item exactly once'),
        }),
      ]),
    )
    expect(completion.messages).toContainEqual({
      role: 'user',
      content: JSON.stringify({ request, recentlyBought: [] }),
    })
    expect(info).toHaveBeenCalledExactlyOnceWith('[cart] parsed needs', { request, items, skipped })
  })
})

import { it, expect } from 'vitest'
import { heuristicPolicy } from './openai'

it('excludes a category from varied phrasings', () => {
  expect(heuristicPolicy('dont split alcohol with me')).toEqual({ type: 'exclude_category', params: { category: 'alcohol' } })
  expect(heuristicPolicy("I'm vegetarian, no meat")).toEqual({ type: 'exclude_category', params: { category: 'meat' } })
})

it('parses an approval threshold with a dollar amount', () => {
  expect(heuristicPolicy('ask me before anything over $40')).toEqual({ type: 'approval_threshold', params: { amount_cents: 4000 } })
  expect(heuristicPolicy('approve purchases above 25 dollars')).toEqual({ type: 'approval_threshold', params: { amount_cents: 2500 } })
})

it('parses a split weight', () => {
  expect(heuristicPolicy('I use more, give me a double share')).toEqual({ type: 'split_weight', params: { weight: 2 } })
  expect(heuristicPolicy('give me a 3x share')).toEqual({ type: 'split_weight', params: { weight: 3 } })
})

it('excludes a specific item when the noun is not a category', () => {
  expect(heuristicPolicy('no bread for me')).toEqual({ type: 'exclude_item', params: { item: 'bread' } })
  expect(heuristicPolicy("don't charge me for oat milk")).toEqual({ type: 'exclude_item', params: { item: 'oat milk' } })
  // A category word still compiles to exclude_category, not exclude_item.
  expect(heuristicPolicy('no alcohol for me')).toEqual({ type: 'exclude_category', params: { category: 'alcohol' } })
})

it('returns null when nothing matches', () => {
  expect(heuristicPolicy('hello there friend')).toBeNull()
})

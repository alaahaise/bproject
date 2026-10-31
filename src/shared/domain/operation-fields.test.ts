import { describe, expect, it } from 'vitest'
import { allowsBl, requiresBlForSecondWeigh } from './operation-fields'

describe('allowsBl', () => {
  it('hides BL for an ordinary incoming ticket', () => {
    expect(allowsBl('ENTREE', false)).toBe(false)
  })

  it('allows an optional manually entered BL for an incoming return', () => {
    expect(allowsBl('ENTREE', true)).toBe(true)
  })

  it('keeps BL available for ordinary outgoing tickets', () => {
    expect(allowsBl('SORTIE', false)).toBe(true)
  })

  it('hides BL for outsiders, regardless of return flag', () => {
    expect(allowsBl('TIERS', false)).toBe(false)
    expect(allowsBl('TIERS', true)).toBe(false)
  })
})

describe('requiresBlForSecondWeigh', () => {
  it('requires a BL only for ordinary sorties', () => {
    expect(requiresBlForSecondWeigh('SORTIE', false, false)).toBe(true)
    expect(requiresBlForSecondWeigh('SORTIE', true, false)).toBe(false)
    expect(requiresBlForSecondWeigh('SORTIE', false, true)).toBe(false)
    expect(requiresBlForSecondWeigh('TIERS', false, false)).toBe(false)
  })
})

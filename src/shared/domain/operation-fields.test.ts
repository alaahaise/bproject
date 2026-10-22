import { describe, expect, it } from 'vitest'
import { allowsBl } from './operation-fields'

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
})

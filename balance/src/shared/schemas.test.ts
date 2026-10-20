import { describe, expect, it } from 'vitest'
import { blApiUrlSchema, blLookupSchema } from './schemas'

describe('blLookupSchema', () => {
  it('accepts the formats typed by the operator', () => {
    expect(blLookupSchema.parse({ number: ' BL26-05255 ' })).toEqual({ number: 'BL26-05255' })
  })

  it('rejects an empty number', () => {
    expect(blLookupSchema.safeParse({ number: '   ' }).success).toBe(false)
  })
})

describe('blApiUrlSchema', () => {
  it('accepts an empty value (local default)', () => {
    expect(blApiUrlSchema.parse({ url: '' })).toEqual({ url: '' })
  })

  it('accepts http and https URLs', () => {
    expect(blApiUrlSchema.parse({ url: 'http://127.0.0.1:3000' })).toEqual({
      url: 'http://127.0.0.1:3000'
    })
    expect(blApiUrlSchema.parse({ url: 'https://bl.example.com/api' })).toEqual({
      url: 'https://bl.example.com/api'
    })
  })

  it('rejects non-http schemes', () => {
    expect(blApiUrlSchema.safeParse({ url: 'file:///C:/secret' }).success).toBe(false)
  })

  it('rejects credentials, query strings and fragments', () => {
    expect(blApiUrlSchema.safeParse({ url: 'http://user:pass@bl:3000' }).success).toBe(false)
    expect(blApiUrlSchema.safeParse({ url: 'http://bl:3000?x=1' }).success).toBe(false)
    expect(blApiUrlSchema.safeParse({ url: 'http://bl:3000#x' }).success).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  blApiUrlSchema,
  blLookupSchema,
  captureSchema,
  opFilterSchema,
  opUpdateSchema,
  ticketDraftSchema
} from './schemas'

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

describe('vrac', () => {
  it('accepte un ticket vrac et le produit saisi à la 2e pesée, sans quantité', () => {
    expect(ticketDraftSchema.parse({ type: 'SORTIE', isVrac: true }).isVrac).toBe(true)

    const parsed = captureSchema.parse({
      operationId: 1,
      weight: 25750,
      isManual: false,
      vracProduct: '  Maïs vrac '
    })
    expect(parsed.vracProduct).toBe('Maïs vrac')
  })

  it('refuse un produit vrac vide ou trop long', () => {
    const base = { operationId: 1, weight: 1, isManual: false }
    expect(captureSchema.safeParse({ ...base, vracProduct: '   ' }).success).toBe(false)
    expect(captureSchema.safeParse({ ...base, vracProduct: 'x'.repeat(65) }).success).toBe(false)
  })

  it('laisse passer le drapeau en correction et le filtre « BL à établir »', () => {
    expect(opUpdateSchema.parse({ id: 1, patch: { isVrac: true } }).patch.isVrac).toBe(true)
    expect(opFilterSchema.parse({ blPending: true }).blPending).toBe(true)
  })

  it('une ligne ordinaire exige toujours une quantité positive', () => {
    const result = ticketDraftSchema.safeParse({
      type: 'SORTIE',
      lines: [{ productCode: 'CMV', quantityKg: 0 }]
    })
    expect(result.success).toBe(false)
  })
})

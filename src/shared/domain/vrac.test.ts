import { describe, expect, it } from 'vitest'
import { BL_MATCH_TOLERANCE_KG, buildVracLine, canBeVrac, compareBlToNet, isBlPending } from './vrac'

describe('canBeVrac', () => {
  it('seule une sortie ordinaire peut être du vrac', () => {
    expect(canBeVrac('SORTIE', false)).toBe(true)
    expect(canBeVrac('SORTIE', true)).toBe(false)
    expect(canBeVrac('ENTREE', false)).toBe(false)
    expect(canBeVrac('TRANSFERT', false)).toBe(false)
    expect(canBeVrac('TIERS', false)).toBe(false)
  })
})

describe('buildVracLine', () => {
  it('prend le poids net pour quantité', () => {
    expect(buildVracLine('Maïs vrac', 28350)).toEqual({
      ok: true,
      line: { productCode: 'Maïs vrac', quantityKg: 28350 }
    })
  })

  it('nettoie le produit et arrondit au gramme', () => {
    expect(buildVracLine('  Son  ', 1000.00049)).toEqual({
      ok: true,
      line: { productCode: 'Son', quantityKg: 1000 }
    })
  })

  it('refuse sans produit', () => {
    expect(buildVracLine('', 100)).toEqual({ ok: false, reason: 'NO_PRODUCT' })
    expect(buildVracLine('   ', 100)).toEqual({ ok: false, reason: 'NO_PRODUCT' })
    expect(buildVracLine(null, 100)).toEqual({ ok: false, reason: 'NO_PRODUCT' })
  })

  it('refuse un net nul : pas de quantité, donc pas de stock ni de BL possible', () => {
    expect(buildVracLine('Maïs', 0)).toEqual({ ok: false, reason: 'NET_NOT_POSITIVE' })
  })

  it('coupe un nom trop long à la taille de la colonne', () => {
    const result = buildVracLine('x'.repeat(100), 10)
    expect(result.ok && result.line.productCode).toHaveLength(64)
  })
})

describe('isBlPending', () => {
  const base = { isVrac: true, blNo: null, status: 'FERMEE', second: { weight: 1 } }

  it('un vrac pesé sans BL attend son BL', () => {
    expect(isBlPending(base)).toBe(true)
    expect(isBlPending({ ...base, blNo: '  ' })).toBe(true)
  })

  it("n'attend plus rien une fois le BL renseigné", () => {
    expect(isBlPending({ ...base, blNo: 'BL26-05255' })).toBe(false)
  })

  it("n'attend pas de BL avant la 2e pesée, ni annulé, ni hors vrac", () => {
    expect(isBlPending({ ...base, second: null })).toBe(false)
    expect(isBlPending({ ...base, status: 'ANNULEE' })).toBe(false)
    expect(isBlPending({ ...base, isVrac: false })).toBe(false)
  })
})

describe('compareBlToNet', () => {
  it('concorde à la tolérance près (arrondi au quintal)', () => {
    expect(compareBlToNet(28350.4, 28350)).toMatchObject({ kind: 'match', diffKg: 0.4 })
    expect(compareBlToNet(2000, 2000 + BL_MATCH_TOLERANCE_KG)).toMatchObject({ kind: 'match' })
  })

  it('signale un BL qui facture plus ou moins que la pesée', () => {
    expect(compareBlToNet(30000, 28350)).toEqual({
      kind: 'differs',
      blWeightKg: 30000,
      netKg: 28350,
      diffKg: 1650
    })
    expect(compareBlToNet(28000, 28350)).toMatchObject({ kind: 'differs', diffKg: -350 })
  })

  it('ne juge pas quand un poids manque (BL sans poids connu)', () => {
    expect(compareBlToNet(null, 28350)).toEqual({ kind: 'unknown' })
    expect(compareBlToNet(28350, null)).toEqual({ kind: 'unknown' })
  })
})

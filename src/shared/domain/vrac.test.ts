import { describe, expect, it } from 'vitest'
import type { VracRotation } from '../types'
import {
  BL_MATCH_TOLERANCE_KG,
  buildVracLine,
  canBeVrac,
  closeBlocker,
  compareBlToNet,
  isBlPending,
  isGroupBlPending,
  summarizeVracGroup
} from './vrac'

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


const rotation = (over: Partial<VracRotation> = {}): VracRotation => ({
  operationId: 1,
  ticketNo: 'S-2026-000010',
  plate: '12345-116-16',
  status: 'FERMEE',
  productCode: 'Maïs vrac',
  grossWeight: 34150,
  tareWeight: 8400,
  netWeight: 25750,
  weighed: true,
  partnerName: null,
  blNo: null,
  blDate: null,
  createdAt: '2026-10-21 08:00:00',
  ...over
})

const head = { id: 5, status: 'OUVERT' as const, createdAt: '2026-10-21 08:00:00', closedAt: null }

describe('summarizeVracGroup', () => {
  it('additionne les nets des 4 rotations : un seul total pour un seul BL', () => {
    const group = summarizeVracGroup(head, [
      rotation({ operationId: 1, ticketNo: 'S-2026-000010', netWeight: 25750 }),
      rotation({ operationId: 2, ticketNo: 'S-2026-000011', netWeight: 26100 }),
      rotation({ operationId: 3, ticketNo: 'S-2026-000012', netWeight: 25900.5 }),
      rotation({ operationId: 4, ticketNo: 'S-2026-000013', netWeight: 26250 })
    ])

    expect(group.totalNetKg).toBe(104000.5)
    expect(group.weighedCount).toBe(4)
    expect(group.awaitingCount).toBe(0)
    expect(group.reference).toBe('S-2026-000010')
    expect(group.products).toEqual([{ productCode: 'Maïs vrac', quantityKg: 104000.5 }])
  })

  it("ne compte ni les rotations annulées ni celles qui n'ont pas de 2e pesée", () => {
    const group = summarizeVracGroup(head, [
      rotation({ operationId: 1, netWeight: 25750 }),
      rotation({ operationId: 2, status: 'ANNULEE', netWeight: 9999 }),
      rotation({ operationId: 3, status: 'OUVERTE', weighed: false, netWeight: null })
    ])

    expect(group.totalNetKg).toBe(25750)
    expect(group.weighedCount).toBe(1)
    expect(group.awaitingCount).toBe(1)
  })

  it('totalise par produit quand le client en prend plusieurs', () => {
    const group = summarizeVracGroup(head, [
      rotation({ operationId: 1, productCode: 'Maïs', netWeight: 20000 }),
      rotation({ operationId: 2, productCode: 'Son', netWeight: 5000 }),
      rotation({ operationId: 3, productCode: 'Maïs', netWeight: 22000 })
    ])
    expect(group.products).toEqual([
      { productCode: 'Maïs', quantityKg: 42000 },
      { productCode: 'Son', quantityKg: 5000 }
    ])
  })

  it('reprend le client et le BL de la première rotation qui les porte', () => {
    const group = summarizeVracGroup(head, [
      rotation({ operationId: 1 }),
      rotation({ operationId: 2, partnerName: 'HANGAR AIN NOUISSY', blNo: 'BL26-05255', blDate: '2026-10-22' })
    ])
    expect(group).toMatchObject({
      partnerName: 'HANGAR AIN NOUISSY',
      blNo: 'BL26-05255',
      blDate: '2026-10-22'
    })
  })

  it("un enlèvement sans rotation a un total nul et se nomme par son id", () => {
    const group = summarizeVracGroup(head, [])
    expect(group).toMatchObject({ totalNetKg: 0, weighedCount: 0, reference: '#5' })
  })
})

describe('closeBlocker', () => {
  const group = (over = {}, rotations = [rotation()]) =>
    ({ ...summarizeVracGroup(head, rotations), ...over })

  it('autorise la clôture quand toutes les rotations sont pesées', () => {
    expect(closeBlocker(group())).toBeNull()
  })

  it('refuse sans rotation pesée', () => {
    expect(closeBlocker(group({}, []))).toBe('NO_ROTATION')
  })

  it("refuse tant qu'un camion n'est pas revenu à la 2e balance", () => {
    expect(
      closeBlocker(group({}, [rotation(), rotation({ operationId: 2, weighed: false, netWeight: null, status: 'OUVERTE' })]))
    ).toBe('AWAITING_SECOND')
  })

  it('refuse un enlèvement déjà clos', () => {
    expect(closeBlocker(group({ status: 'CLOS' }))).toBe('ALREADY_CLOSED')
  })
})

describe('isGroupBlPending', () => {
  it('attend son BL tant que le commercial ne l’a pas établi', () => {
    expect(isGroupBlPending(summarizeVracGroup(head, [rotation()]))).toBe(true)
    expect(isGroupBlPending(summarizeVracGroup(head, [rotation({ blNo: 'BL26-05255' })]))).toBe(false)
    expect(isGroupBlPending(summarizeVracGroup(head, []))).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { captureBlock, parseTypedWeight, type CaptureState } from './capture'

const READY: CaptureState = {
  busy: false,
  formBlock: null,
  manual: false,
  typedValid: false,
  running: true,
  hasSample: true,
  stable: true
}

describe('captureBlock', () => {
  it('autorise la pesée quand le poids est stable et la saisie complète', () => {
    expect(captureBlock(READY)).toBeNull()
  })

  it('refuse pendant un enregistrement en cours', () => {
    expect(captureBlock({ ...READY, busy: true })).toBe('busy')
  })

  it('signale la saisie incomplète avant le poids', () => {
    const state = { ...READY, stable: false, formBlock: 'incompleteLines' as const }
    expect(captureBlock(state)).toBe('incompleteLines')
  })

  it('distingue balance arrêtée, balance muette et poids instable', () => {
    expect(captureBlock({ ...READY, running: false, hasSample: false })).toBe('balanceOff')
    expect(captureBlock({ ...READY, hasSample: false })).toBe('noSample')
    expect(captureBlock({ ...READY, stable: false })).toBe('unstable')
  })

  it('une balance arrêtée mais qui a déjà envoyé un poids stable reste utilisable', () => {
    expect(captureBlock({ ...READY, running: false })).toBeNull()
  })

  it('en saisie manuelle, ignore la balance et exige un poids valide', () => {
    const manual = { ...READY, manual: true, running: false, hasSample: false, stable: false }
    expect(captureBlock({ ...manual, typedValid: false })).toBe('manualEmpty')
    expect(captureBlock({ ...manual, typedValid: true })).toBeNull()
  })

  it('en saisie manuelle, la saisie du ticket bloque toujours', () => {
    const state = { ...READY, manual: true, typedValid: true, formBlock: 'staleTicket' as const }
    expect(captureBlock(state)).toBe('staleTicket')
  })
})

describe('parseTypedWeight', () => {
  it('accepte le point et la virgule', () => {
    expect(parseTypedWeight('12450.5')).toBe(12450.5)
    expect(parseTypedWeight('12450,5')).toBe(12450.5)
    expect(parseTypedWeight(' 80 ')).toBe(80)
  })

  it('accepte zéro (pont vide)', () => {
    expect(parseTypedWeight('0')).toBe(0)
  })

  it('limite la précision aux millièmes stockés en base', () => {
    expect(parseTypedWeight('12.345')).toBe(12.345)
    expect(parseTypedWeight('12,345')).toBe(12.345)
    expect(parseTypedWeight('12.3456')).toBeNull()
    expect(parseTypedWeight('1e3')).toBeNull()
  })

  it('refuse les poids au-dessus de la limite acceptée par la pesée', () => {
    expect(parseTypedWeight('1000000')).toBe(1_000_000)
    expect(parseTypedWeight('1000000.001')).toBeNull()
  })

  it('refuse le vide, le négatif et le texte', () => {
    expect(parseTypedWeight('')).toBeNull()
    expect(parseTypedWeight('   ')).toBeNull()
    expect(parseTypedWeight('-5')).toBeNull()
    expect(parseTypedWeight('abc')).toBeNull()
  })
})

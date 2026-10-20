import { describe, expect, it } from 'vitest'
import { buildBlLookup } from './bl'

describe('buildBlLookup', () => {
  it('maps the client and the weighted lines', () => {
    const result = buildBlLookup({
      reference: ' BL26-05255 ',
      date: '2026-07-01',
      clientName: ' HANGAR AIN NOUISSY ',
      clientCode: '78',
      lines: [
        { code: 'VIG 1L', name: 'Vigosine 1L', quantity: 2, weightKg: 2, weightSource: 'line' },
        { code: 'INT A+', name: 'Introvit A+', quantity: 6, weightKg: 7.5, weightSource: 'unit' }
      ]
    })

    expect(result.reference).toBe('BL26-05255')
    expect(result.clientName).toBe('HANGAR AIN NOUISSY')
    expect(result.clientCode).toBe('78')
    expect(result.lines).toHaveLength(2)
    expect(result.totalWeightKg).toBe(9.5)
    expect(result.weightComplete).toBe(true)
    expect(result.unknownWeightLines).toBe(0)
  })

  it('keeps a partial total out of totalWeightKg', () => {
    const result = buildBlLookup({
      reference: 'BL26-1',
      lines: [
        { code: 'A', name: 'Produit A', quantity: 1, weightKg: 10, weightSource: 'article' },
        { code: 'B', name: 'Produit B', quantity: 2, weightKg: null }
      ]
    })

    expect(result.totalWeightKg).toBeNull()
    expect(result.knownWeightKg).toBe(10)
    expect(result.weightComplete).toBe(false)
    expect(result.unknownWeightLines).toBe(1)
  })

  it('never turns a zero or negative weight into a valid weight', () => {
    const result = buildBlLookup({
      reference: 'BL26-2',
      lines: [
        { code: 'A', name: 'A', quantity: 1, weightKg: 0 },
        { code: 'B', name: 'B', quantity: 1, weightKg: -3 }
      ]
    })

    expect(result.lines.map((line) => line.weightKg)).toEqual([null, null])
    expect(result.totalWeightKg).toBeNull()
    expect(result.unknownWeightLines).toBe(2)
  })

  it('drops lines without a code or a name', () => {
    const result = buildBlLookup({
      reference: 'BL26-3',
      lines: [
        { code: null, name: '  ', quantity: 1, weightKg: 2 },
        { code: ' OK ', name: null, quantity: 1, weightKg: 2, weightSource: 'line' }
      ]
    })

    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].code).toBe('OK')
    expect(result.totalWeightKg).toBe(2)
  })

  it('has no total for an empty BL', () => {
    const result = buildBlLookup({ reference: 'BL26-4', lines: [] })

    expect(result.totalWeightKg).toBeNull()
    expect(result.knownWeightKg).toBe(0)
    expect(result.weightComplete).toBe(false)
    expect(result.unknownWeightLines).toBe(0)
  })
})

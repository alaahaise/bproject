import { describe, expect, it } from 'vitest'
import { BlNumberError, parseBlInput } from './bl-number'

const y2026n5255 = { reference: null, year: 2026, number: 5255 }
const bare5255 = { reference: null, year: null, number: 5255 }

describe('parseBlInput', () => {
  it.each([
    ['BL26-05255', y2026n5255],
    ['BL2605255', y2026n5255],
    ['BL26-5255', y2026n5255],
    ['BL2026-05255', y2026n5255],
    ['BL202605255', y2026n5255],
    ['26-05255', y2026n5255],
    ['2026-05255', y2026n5255],
    ['2605255', y2026n5255],
    ['202605255', y2026n5255],
    ['N° BL 26/05255', y2026n5255],
    ['BL N° 26-05255', y2026n5255],
    ['BL230001', { reference: null, year: 2023, number: 1 }]
  ])('lit « %s » comme année + numéro', (input, expected) => {
    expect(parseBlInput(input)).toEqual(expected)
  })

  it.each(['5255', '05255', 'BL05255', 'BL 5255'])('lit « %s » comme un numéro seul', (input) => {
    expect(parseBlInput(input)).toEqual(bare5255)
  })

  it("utilise le paramètre d'année pour un numéro seul", () => {
    expect(parseBlInput('5255', '2025')).toEqual({ reference: null, year: 2025, number: 5255 })
    expect(parseBlInput('5255', '25')).toEqual({ reference: null, year: 2025, number: 5255 })
  })

  it("refuse une année qui contredit celle du numéro", () => {
    expect(() => parseBlInput('BL26-05255', '2025')).toThrow(BlNumberError)
  })

  it('accepte la même année répétée', () => {
    expect(parseBlInput('BL26-05255', '2026')).toEqual(y2026n5255)
  })

  it('laisse passer une référence de format inconnu en égalité exacte', () => {
    expect(parseBlInput('BLABC')).toEqual({ reference: 'BLABC', year: null, number: null })
  })

  it('traite une longue référence BL inconnue comme une référence exacte', () => {
    expect(parseBlInput('BL1234567890')).toEqual({
      reference: 'BL1234567890',
      year: null,
      number: null
    })
  })

  it.each(['abc', '', '   ', 'BL', '12345678901'])(
    'refuse « %s »',
    (input) => {
      expect(() => parseBlInput(input)).toThrow(BlNumberError)
    }
  )

  it("refuse un paramètre d'année invalide", () => {
    expect(() => parseBlInput('5255', '20x6')).toThrow(BlNumberError)
    expect(() => parseBlInput('5255', '1999')).toThrow(BlNumberError)
  })

  it("expose un statut HTTP 400", () => {
    expect(new BlNumberError('x').statusCode).toBe(400)
  })
})

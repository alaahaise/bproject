import { describe, expect, it } from 'vitest'
import { resolveLineWeight, summarizeWeights } from './bl-weight'

describe('resolveLineWeight', () => {
  it("utilise d'abord le poids explicite de la ligne", () => {
    expect(
      resolveLineWeight({ quantity: 4, lineWeight: 10, unitWeight: 1, articleWeight: 2 })
    ).toEqual({ weightKg: 10, unitWeightKg: 2.5, weightSource: 'line' })
  })

  it('multiplie le poids unitaire par la quantité', () => {
    expect(
      resolveLineWeight({ quantity: 3, lineWeight: 0, unitWeight: 2.5, articleWeight: 4 })
    ).toEqual({ weightKg: 7.5, unitWeightKg: 2.5, weightSource: 'unit' })
  })

  it("retombe sur le poids de l'article", () => {
    expect(
      resolveLineWeight({ quantity: 3, lineWeight: null, unitWeight: 0, articleWeight: 2 })
    ).toEqual({ weightKg: 6, unitWeightKg: 2, weightSource: 'article' })
  })

  it('convertit la quantité de quintaux en kg quand le produit est sans poids', () => {
    expect(
      resolveLineWeight({ quantity: 1, lineWeight: 0, unitWeight: 0, articleWeight: 0 })
    ).toEqual({ weightKg: 100, unitWeightKg: 100, weightSource: 'quintal' })
  })

  it('garde un poids inconnu à null sans quantité', () => {
    expect(
      resolveLineWeight({ quantity: 0, lineWeight: 0, unitWeight: 0, articleWeight: 0 })
    ).toEqual({ weightKg: null, unitWeightKg: null, weightSource: null })
  })

  it("un poids de ligne à 0 ne masque pas un poids d'article valide (valeurs texte)", () => {
    const result = resolveLineWeight({
      quantity: '2',
      lineWeight: '0',
      unitWeight: null,
      articleWeight: '1.5'
    })
    expect(result.weightKg).toBe(3)
    expect(result.weightSource).toBe('article')
  })
})

describe('summarizeWeights', () => {
  it('additionne le repli en quintaux en total de BL', () => {
    const lines = [2, 6, 12].map((quantity) => resolveLineWeight({ quantity }))
    expect(summarizeWeights(lines)).toEqual({
      totalWeightKg: 2000,
      knownWeightKg: 2000,
      weightComplete: true,
      unknownWeightLines: 0
    })
  })

  it('additionne un jeu complet', () => {
    expect(summarizeWeights([{ weightKg: 10 }, { weightKg: 2.5 }])).toEqual({
      totalWeightKg: 12.5,
      knownWeightKg: 12.5,
      weightComplete: true,
      unknownWeightLines: 0
    })
  })

  it('ne présente pas un total partiel comme le total du BL', () => {
    expect(summarizeWeights([{ weightKg: 10 }, { weightKg: null }])).toEqual({
      totalWeightKg: null,
      knownWeightKg: 10,
      weightComplete: false,
      unknownWeightLines: 1
    })
  })

  it("une liste vide n'a pas de total", () => {
    expect(summarizeWeights([])).toEqual({
      totalWeightKg: null,
      knownWeightKg: 0,
      weightComplete: false,
      unknownWeightLines: 0
    })
  })
})

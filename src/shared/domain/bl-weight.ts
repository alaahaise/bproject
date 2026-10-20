/**
 * Résolution du poids d'une ligne de BL.
 *
 * HFSQL range le poids à plusieurs endroits selon la configuration de l'article.
 * L'ordre est délibéré : le poids explicite de la ligne (ce que le commercial a
 * vu), puis le poids unitaire, puis le poids de l'article. Les produits
 * vétérinaires finis n'ont aucun poids : leur `Qte` est en quintaux
 * (1 quintal = 100 kg). Un poids inconnu reste `null` : jamais 0, car 0 kg
 * ressemblerait à un poids valide pour le pont-bascule.
 */
import type { BlWeightSource } from '../types'

export const KG_PER_QUINTAL = 100


export interface LineWeightInput {
  /** Ligne_MT.Qte (quintaux quand aucun poids n'est configuré). */
  quantity?: unknown
  /** Ligne_MT.POIDS : total de la ligne, en kg. */
  lineWeight?: unknown
  /** Ligne_MT.POIDS_UN : kg par unité. */
  unitWeight?: unknown
  /** Articles.POIDS_BRUT : kg par unité. */
  articleWeight?: unknown
}

export interface ResolvedLineWeight {
  weightKg: number | null
  unitWeightKg: number | null
  weightSource: BlWeightSource | null
}

export interface WeightSummary {
  totalWeightKg: number | null
  knownWeightKg: number
  weightComplete: boolean
  unknownWeightLines: number
}

export function positive(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

export function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

export function resolveLineWeight(input: LineWeightInput = {}): ResolvedLineWeight {
  const qty = positive(input.quantity)
  const line = positive(input.lineWeight)

  if (line !== null) {
    return {
      weightKg: round3(line),
      unitWeightKg: qty !== null ? round3(line / qty) : null,
      weightSource: 'line'
    }
  }

  const unit = positive(input.unitWeight)
  if (unit !== null && qty !== null) {
    return { weightKg: round3(unit * qty), unitWeightKg: round3(unit), weightSource: 'unit' }
  }

  const article = positive(input.articleWeight)
  if (article !== null && qty !== null) {
    return {
      weightKg: round3(article * qty),
      unitWeightKg: round3(article),
      weightSource: 'article'
    }
  }

  // Produit vétérinaire fini : la quantité du BL est en quintaux.
  if (qty !== null) {
    return {
      weightKg: round3(qty * KG_PER_QUINTAL),
      unitWeightKg: KG_PER_QUINTAL,
      weightSource: 'quintal'
    }
  }

  return {
    weightKg: null,
    unitWeightKg: unit !== null ? round3(unit) : article !== null ? round3(article) : null,
    weightSource: null
  }
}

/** Un total partiel n'est jamais présenté comme le total du BL. */
export function summarizeWeights(lines: ReadonlyArray<{ weightKg?: unknown }> = []): WeightSummary {
  let known = 0
  let unknown = 0

  for (const line of lines) {
    const weight = positive(line?.weightKg)
    if (weight === null) unknown += 1
    else known += weight
  }

  const complete = lines.length > 0 && unknown === 0
  return {
    totalWeightKg: complete ? round3(known) : null,
    knownWeightKg: round3(known),
    weightComplete: complete,
    unknownWeightLines: unknown
  }
}

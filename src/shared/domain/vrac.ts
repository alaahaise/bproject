/**
 * Règles du vrac : une sortie pesée avant qu'aucun BL n'existe.
 *
 * Fonctions pures (ni Electron ni MySQL) : le dépôt les applique, l'écran les
 * utilise pour décider quoi afficher.
 */
import type { OperationType, ProductLine } from '../types'
import { roundKg } from './weighing'

/** Seule une vraie sortie peut être du vrac : ni entrée, ni transfert, ni retour. */
export function canBeVrac(type: OperationType, isRetour: boolean): boolean {
  return type === 'SORTIE' && !isRetour
}

export type VracLineResult =
  | { ok: true; line: ProductLine }
  | { ok: false; reason: 'NO_PRODUCT' | 'NET_NOT_POSITIVE' }

/**
 * La ligne unique d'un ticket vrac : le produit saisi, et le poids net pesé
 * pour quantité. Un seul produit : le net ne peut pas se répartir entre
 * plusieurs produits sans BL pour dire combien de chacun.
 */
export function buildVracLine(
  productCode: string | null | undefined,
  netWeight: number
): VracLineResult {
  const product = productCode?.trim() ?? ''
  if (product === '') return { ok: false, reason: 'NO_PRODUCT' }
  const net = roundKg(netWeight)
  if (!(net > 0)) return { ok: false, reason: 'NET_NOT_POSITIVE' }
  return { ok: true, line: { productCode: product.slice(0, 64), quantityKg: net } }
}

/**
 * Un vrac pesé attend son BL tant que le commercial ne l'a pas établi. Même
 * définition que le filtre SQL `blPending`.
 */
export function isBlPending(op: {
  isVrac: boolean
  blNo?: string | null
  status: string
  second: unknown
}): boolean {
  return op.isVrac && op.second != null && op.status !== 'ANNULEE' && !op.blNo?.trim()
}

/** Au-delà, le BL du commercial ne correspond plus au poids pesé (arrondi au quintal près). */
export const BL_MATCH_TOLERANCE_KG = 1

export type BlCheck =
  | { kind: 'unknown' }
  | { kind: 'match' | 'differs'; blWeightKg: number; netKg: number; diffKg: number }

/**
 * Compare le poids du BL établi par le commercial au poids net pesé. `diffKg`
 * = BL − pesée : positif quand le BL facture plus que ce qui est sorti.
 * Informatif : l'écran signale la différence, il ne bloque pas.
 */
export function compareBlToNet(blWeightKg: number | null, netKg: number | null): BlCheck {
  if (blWeightKg == null || netKg == null) return { kind: 'unknown' }
  const diffKg = roundKg(blWeightKg - netKg)
  return {
    kind: Math.abs(diffKg) <= BL_MATCH_TOLERANCE_KG ? 'match' : 'differs',
    blWeightKg: roundKg(blWeightKg),
    netKg: roundKg(netKg),
    diffKg
  }
}

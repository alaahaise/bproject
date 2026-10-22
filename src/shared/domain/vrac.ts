/**
 * Règles du vrac : une sortie pesée avant qu'aucun BL n'existe.
 *
 * Fonctions pures (ni Electron ni MySQL) : le dépôt les applique, l'écran les
 * utilise pour décider quoi afficher.
 */
import type {
  OperationType,
  ProductLine,
  VracGroup,
  VracGroupStatus,
  VracRotation
} from '../types'
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

// ---------------------------------------------------------------------------
// Enlèvement vrac : plusieurs rotations, un seul BL
// ---------------------------------------------------------------------------

/**
 * Regroupe les rotations d'un enlèvement et en tire le total. Une rotation annulée
 * ne compte pas ; une rotation non pesée deux fois n'a pas encore de net.
 */
export function summarizeVracGroup(
  head: { id: number; status: VracGroupStatus; createdAt: string; closedAt: string | null },
  rotations: VracRotation[]
): VracGroup {
  const active = rotations.filter((r) => r.status !== 'ANNULEE')
  const weighed = active.filter((r) => r.weighed && r.netWeight != null)

  const byProduct = new Map<string, number>()
  for (const rotation of weighed) {
    const product = rotation.productCode?.trim()
    if (!product) continue
    byProduct.set(product, roundKg((byProduct.get(product) ?? 0) + (rotation.netWeight ?? 0)))
  }

  const first = (pick: (r: VracRotation) => string | null): string | null =>
    active.map(pick).find((value) => value != null && value.trim() !== '') ?? null

  return {
    id: head.id,
    reference: (active[0] ?? rotations[0])?.ticketNo ?? `#${head.id}`,
    status: head.status,
    createdAt: head.createdAt,
    closedAt: head.closedAt,
    partnerName: first((r) => r.partnerName),
    blNo: first((r) => r.blNo),
    blDate: first((r) => r.blDate),
    rotations,
    totalNetKg: roundKg(weighed.reduce((sum, r) => sum + (r.netWeight ?? 0), 0)),
    weighedCount: weighed.length,
    awaitingCount: active.filter((r) => !r.weighed).length,
    products: [...byProduct].map(([productCode, quantityKg]) => ({ productCode, quantityKg }))
  }
}

export type CloseBlocker = 'ALREADY_CLOSED' | 'NO_ROTATION' | 'AWAITING_SECOND'

/**
 * Peut-on clôturer l'enlèvement ? Non s'il l'est déjà, s'il n'a aucune rotation
 * pesée (rien à facturer), ou si un camion est encore parti charger : sa 2e pesée
 * manquerait au total remis au commercial.
 */
export function closeBlocker(group: VracGroup): CloseBlocker | null {
  if (group.status === 'CLOS') return 'ALREADY_CLOSED'
  if (group.weighedCount === 0) return 'NO_ROTATION'
  if (group.awaitingCount > 0) return 'AWAITING_SECOND'
  return null
}

/** Enlèvement pesé dont le BL n'est pas encore établi par le commercial. */
export function isGroupBlPending(group: VracGroup): boolean {
  return group.weighedCount > 0 && !group.blNo?.trim()
}

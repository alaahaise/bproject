/** Vocabulaire partagé entre le processus principal, le preload et le renderer. */

export const OPERATION_TYPES = ['ENTREE', 'SORTIE', 'TRANSFERT', 'TIERS'] as const
export type OperationType = (typeof OPERATION_TYPES)[number]

/** TARE = poids à vide, BRUT = poids chargé. */
export const WEIGH_KINDS = ['TARE', 'BRUT'] as const
export type WeighKind = (typeof WEIGH_KINDS)[number]

export type OperationStatus = 'OUVERTE' | 'FERMEE' | 'ANNULEE'

export type UserRole = 'ADMIN' | 'SUPERVISEUR' | 'OPERATEUR'

export interface SessionUser {
  id: number
  username: string
  fullName: string
  role: UserRole
}

/** Une ligne de produit d'un ticket : « 1 t de CMV X », « 4 t de CMV Y ». */
export interface ProductLine {
  productId?: number | null
  productCode: string
  /** Poids supposé de ce produit. La somme des lignes = poids supposé du ticket. */
  quantityKg: number
}

/** Origine du poids calculé pour une ligne de BL. */
export type BlWeightSource = 'line' | 'unit' | 'article' | 'quintal'

/** Une ligne de bon de livraison lue depuis l'API HFSQL. */
export interface BlLookupLine {
  /** Code article HFSQL (peut être vide). */
  code: string | null
  /** Libellé article HFSQL (peut être vide). */
  name: string | null
  /** Quantité facturée, en unités du BL (pas forcément des kg). */
  quantity: number | null
  /** Poids total de la ligne en kg, ou null si HFSQL ne le connaît pas. */
  weightKg: number | null
  weightSource: BlWeightSource | null
}

/** Résultat d'une recherche de BL, prêt pour l'écran de pesée. */
export interface BlLookup {
  reference: string
  date: string | null
  clientName: string | null
  clientCode: string | null
  /** Somme en kg, seulement si toutes les lignes ont un poids. */
  totalWeightKg: number | null
  /** Somme des poids connus, même si le total est incomplet. */
  knownWeightKg: number
  weightComplete: boolean
  unknownWeightLines: number
  lines: BlLookupLine[]
}

/** Ce qu'un opérateur remplit avant la première pesée. */
export interface TicketDraft {
  type: OperationType
  /**
   * Retour : marchandise vendue qui revient (ENTREE) ou marchandise renvoyée au
   * fournisseur (SORTIE). Le stock bouge dans le même sens que sans le drapeau.
   */
  isRetour?: boolean
  /**
   * Vrac (SORTIE seulement) : marchandise vendue au poids, sans BL au moment de la
   * pesée. Le poids net devient la quantité ; le commercial établit ensuite le BL.
   */
  isVrac?: boolean
  plate?: string | null
  driverName?: string | null
  partnerId?: number | null
  partnerName?: string | null
  locationFromId?: number | null
  locationToId?: number | null
  blNo?: string | null
  blDate?: string | null
  notes?: string | null
  /** Produits déclarés. Renseignés à la 2e balance, d'où la liste optionnelle. */
  lines?: ProductLine[]
}

export interface Weighing {
  weight: number
  /** ISO 8601 */
  at: string
  isManual?: boolean
  stableMs?: number | null
  /** Réponse brute de la balance, conservée pour litige. */
  raw?: string | null
}

export interface Operation extends TicketDraft {
  id: number
  ticketNo: string
  status: OperationStatus
  isRetour: boolean
  isVrac: boolean
  first: Weighing | null
  second: Weighing | null
  /** Somme des lignes, figée à la 2e pesée. */
  weightSupposed: number | null
  lines: ProductLine[]
  tareWeight: number | null
  grossWeight: number | null
  netWeight: number | null
  ecart: number | null
  ecartOk: boolean | null
  operatorName: string
  createdAt: string
  cancelReason?: string | null
}

/** Un échantillon lu sur la balance, avant tout filtrage métier. */
export interface WeightSample {
  weight: number
  unit: string
  stable: boolean
  stableMs: number
  raw: string
  at: string
}

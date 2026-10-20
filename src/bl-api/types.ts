/** Contrat JSON de l'API BL (ce que lit `src/main/bl/client.ts`). */
import type { BlWeightSource } from '@shared/types'
import type { WeightSummary } from '@shared/domain/bl-weight'
import type { FullDetails } from './full-details'

export interface BlClientDto {
  id: number | null
  code: string | null
  name: string | null
  owner: string | null
  activity: string | null
  address: string | null
  phone: string | null
  mobile: string | null
  email: string | null
  taxId: string | null
}

export interface BlLineDto {
  lineId: number | null
  articleId: number | null
  code: string | null
  name: string | null
  barcode: string | null
  familyId: number | null
  subFamilyId: number | null
  unitId: number | null
  classification: number | null
  category: number | null
  quantity: number | null
  packages: number | null
  packaging: number | null
  quantityVrac: number | null
  /** Valeur brute Ligne_MT.Poids. */
  weight: number | null
  weightKg: number | null
  unitWeightKg: number | null
  weightSource: BlWeightSource | null
  lot: string | null
  expiryDate: string | null
  unitPriceHt: number | null
  totalHt: number | null
}

export interface BlDto extends WeightSummary {
  id: number | null
  reference: string | null
  year: number | null
  number: number | null
  date: string | null
  time: string | null
  deliveryDate: string | null
  status: number | null
  client: BlClientDto | null
  totalHt: number
  totalTtc: number
  lineCount: number
}

export interface BlResult {
  bl: BlDto
  lines: BlLineDto[]
  full?: FullDetails
}

export interface BlCandidate {
  reference: string | null
  year: number | null
  number: number | null
  date: string | null
  client: BlClientDto | null
}

/** Un numéro seul existe pour plusieurs années : l'appelant doit préciser. */
export interface BlAmbiguous {
  ambiguous: true
  candidates: BlCandidate[]
}

export function isAmbiguous(result: BlResult | BlAmbiguous): result is BlAmbiguous {
  return 'ambiguous' in result
}

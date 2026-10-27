import type { OperationType } from '@shared/types'

const OPERATION_PATHS: Record<OperationType, string> = {
  ENTREE: '/entrees',
  SORTIE: '/sorties',
  TRANSFERT: '/transferts',
  TIERS: '/tiers'
}

/** Base route shared by the first and second weigh screens for an operation type. */
export function operationPath(type: OperationType): string {
  return OPERATION_PATHS[type]
}

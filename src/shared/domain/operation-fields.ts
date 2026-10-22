import type { OperationType } from '../types'

/** Ordinary incoming tickets have no BL; a return may carry one if available. */
export function allowsBl(type: OperationType, isRetour: boolean): boolean {
  return type !== 'ENTREE' || isRetour
}

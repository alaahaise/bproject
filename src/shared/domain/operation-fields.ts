import type { OperationType } from '../types'

/** Ordinary incoming tickets have no BL; a return may carry one if available. */
export function allowsBl(type: OperationType, isRetour: boolean): boolean {
  if (type === 'TIERS') return false
  return type !== 'ENTREE' || isRetour
}

/** A standard customer shipment cannot be completed without its delivery note. */
export function requiresBlForSecondWeigh(
  type: OperationType,
  isRetour: boolean,
  isVrac: boolean
): boolean {
  return type === 'SORTIE' && !isRetour && !isVrac
}

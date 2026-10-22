import type { Operation } from '../types'

/**
 * Matricule comparable : majuscules, sans espaces ni tirets. « 12345-116-16 »,
 * « 12345 116 16 » et « 1234511616 » désignent le même camion pour l'opérateur.
 */
export function normalizePlate(plate: string | null | undefined): string {
  return (plate ?? '').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * Tickets restés ouverts, sans 2e pesée, pour ce camion.
 *
 * Un camion qui n'est jamais revenu à la 2e balance laisse un ticket ouvert. S'il
 * se représente pour une nouvelle 1re pesée, cet ancien ticket n'a plus de sens
 * et doit être annulé. Exception : en démarrant explicitement une rotation vrac,
 * un ticket vrac en attente peut rester ouvert pendant qu'une nouvelle rotation
 * du même camion est créée dans son enlèvement.
 */
export function staleTicketsForPlate(
  ops: Operation[],
  plate: string,
  startingVracRotation = false
): Operation[] {
  const wanted = normalizePlate(plate)
  if (wanted === '') return []
  return ops.filter(
    (op) =>
      op.status === 'OUVERTE' &&
      op.second == null &&
      !(startingVracRotation && op.isVrac) &&
      normalizePlate(op.plate) === wanted
  )
}

/**
 * La recherche de la liste « en attente » : le texte tapé figure dans le numéro de
 * ticket, le matricule ou le chauffeur, sans tenir compte de la casse ni des
 * espaces et tirets. Une recherche vide laisse tout passer.
 */
export function ticketMatchesQuery(op: Operation, query: string): boolean {
  const needle = normalizePlate(query)
  if (needle === '') return true
  return [op.ticketNo, op.plate, op.driverName].some((value) =>
    normalizePlate(value).includes(needle)
  )
}

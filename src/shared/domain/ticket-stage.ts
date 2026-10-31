import type { Operation } from '../types'

/**
 * Où en est un ticket, en mots que l'opérateur comprend.
 *
 *  - `waiting`   : pesé une seule fois, le camion doit revenir ;
 *  - `toSave`    : les deux pesées sont faites, l'opérateur doit enregistrer ;
 *  - `done`      : enregistré (c'est lui qui compte dans le stock) ;
 *  - `cancelled` : annulé, définitivement.
 */
export type TicketStage = 'waiting' | 'toSave' | 'done' | 'cancelled'

export function ticketStage(op: Pick<Operation, 'status' | 'second'>): TicketStage {
  if (op.status === 'ANNULEE') return 'cancelled'
  if (op.status === 'FERMEE') return 'done'
  return op.second == null ? 'waiting' : 'toSave'
}

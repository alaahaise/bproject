/**
 * Accès au pont IPC.
 *
 * Electron préfixe les erreurs des handlers (« Error invoking remote method
 * 'ops:create': Error: … ») : ce préfixe technique ne doit jamais apparaître
 * devant un opérateur.
 */
import type { AppApi } from '@shared/channels'

export const api: AppApi = window.api

const IPC_PREFIX = /^Error invoking remote method '[^']*':\s*(Error:\s*)?/

export function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return text.replace(IPC_PREFIX, '')
}

/** Attend un appel IPC en ne laissant remonter qu'un message lisible. */
export async function call<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise
  } catch (err) {
    throw new Error(errorMessage(err), { cause: err })
  }
}

/** Le nombre seul (sans l'unité) : toujours une décimale, séparateur selon la langue. */
export function formatWeightNumber(value: number | null | undefined, lang = 'fr'): string {
  if (value == null) return '—'
  return value.toLocaleString(lang === 'ar' ? 'ar-DZ' : 'fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 3
  })
}

/** Poids affiché : toujours une décimale, séparateur selon la langue. */
export function formatKg(value: number | null | undefined, lang = 'fr'): string {
  if (value == null) return '—'
  return `${formatWeightNumber(value, lang)} kg`
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  // MySQL renvoie 'YYYY-MM-DD HH:mm:ss' : réafficher tel quel, sans repasser par
  // un Date qui décalerait l'heure de pesée.
  return value.replace('T', ' ').slice(0, 16)
}

/**
 * Un ticket vient d'être créé, pesé, enregistré ou annulé : le menu (compteur de
 * camions en attente) se remet à jour sans que les écrans se connaissent entre eux.
 */
export const TICKETS_CHANGED = 'tickets-changed'

export function notifyTicketsChanged(): void {
  window.dispatchEvent(new Event(TICKETS_CHANGED))
}

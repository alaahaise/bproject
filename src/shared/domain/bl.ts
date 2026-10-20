/**
 * Transformation pure d'une réponse de l'API BL vers le modèle de l'écran de
 * pesée. Aucune dépendance Electron/Node : testable sans lancer l'application.
 */
import type { BlLookup, BlLookupLine, BlWeightSource } from '../types'

export interface BlApiLine {
  code?: string | null
  name?: string | null
  quantity?: number | null
  weightKg?: number | null
  weightSource?: BlWeightSource | null
}

export interface BlApiPayload {
  reference: string
  date?: string | null
  clientName?: string | null
  clientCode?: string | null
  lines: BlApiLine[]
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text === '' ? null : text
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function positive(value: unknown): number | null {
  const number = finite(value)
  return number !== null && number > 0 ? number : null
}

function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

export function buildBlLookup(payload: BlApiPayload): BlLookup {
  const lines: BlLookupLine[] = []

  for (const raw of payload.lines) {
    const code = clean(raw.code)
    const name = clean(raw.name)
    if (!code && !name) continue

    const weightKg = positive(raw.weightKg)
    lines.push({
      code,
      name,
      quantity: finite(raw.quantity),
      weightKg,
      weightSource: weightKg === null ? null : (raw.weightSource ?? null)
    })
  }

  const known = lines.reduce((sum, line) => sum + (line.weightKg ?? 0), 0)
  const unknownWeightLines = lines.filter((line) => line.weightKg === null).length
  const weightComplete = lines.length > 0 && unknownWeightLines === 0

  return {
    reference: payload.reference.trim(),
    date: clean(payload.date),
    clientName: clean(payload.clientName),
    clientCode: clean(payload.clientCode),
    totalWeightKg: weightComplete ? round3(known) : null,
    knownWeightKg: round3(known),
    weightComplete,
    unknownWeightLines,
    lines
  }
}

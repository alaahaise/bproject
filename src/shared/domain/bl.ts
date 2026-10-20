/**
 * Transformation pure d'une réponse de l'API BL vers le modèle de l'écran de
 * pesée. Aucune dépendance Electron/Node : testable sans lancer l'application.
 */
import type { BlLookup, BlLookupLine, BlWeightSource } from '../types'
import { positive, summarizeWeights } from './bl-weight'

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

  const { totalWeightKg, knownWeightKg, weightComplete, unknownWeightLines } =
    summarizeWeights(lines)

  return {
    reference: payload.reference.trim(),
    date: clean(payload.date),
    clientName: clean(payload.clientName),
    clientCode: clean(payload.clientCode),
    totalWeightKg,
    knownWeightKg,
    weightComplete,
    unknownWeightLines,
    lines
  }
}

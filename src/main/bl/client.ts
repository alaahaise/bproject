/**
 * Client du service BL (src/bl-api : API Node/HFSQL, lecture seule).
 *
 * L'appel part du processus principal : le renderer ne fait jamais de fetch
 * direct, et l'adresse du service est validée avant d'être enregistrée.
 */
import { z } from 'zod'
import type { BlLookup } from '@shared/types'
import { buildBlLookup } from '@shared/domain/bl'

const DEFAULT_BL_API_URL = 'http://127.0.0.1:3100'
// Le service peut devoir rouvrir la connexion HFSQL (jusqu'à 6 s) avant ses requêtes.
const REQUEST_TIMEOUT_MS = 20_000
const MAX_BODY_LENGTH = 2_000_000

const nullableString = z.string().nullable().optional()
const nullableNumber = z.number().nullable().optional()

const lineSchema = z.object({
  code: nullableString,
  name: nullableString,
  quantity: nullableNumber,
  weightKg: nullableNumber,
  weightSource: z.enum(['line', 'unit', 'article', 'quintal']).nullable().optional()
})

const responseSchema = z.object({
  found: z.literal(true),
  bl: z.object({
    reference: z.string().trim().min(1).max(64),
    date: nullableString,
    client: z
      .object({
        code: nullableString,
        name: nullableString
      })
      .nullable()
      .optional()
  }),
  lines: z.array(lineSchema).max(500)
})

export function blApiBaseUrl(configured?: string | null): string {
  const value = configured?.trim() || process.env.BL_API_URL?.trim() || DEFAULT_BL_API_URL
  return value.replace(/\/+$/, '')
}

/**
 * Le service peut être lancé par l'application uniquement s'il tourne sur la
 * même machine et sert l'API à la racine. Une URL distante ou préfixée reste
 * gérée par l'utilisateur.
 */
export function isLocalBlApiUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
    // Le service lancé par l'application est HTTP ; une URL https locale doit
    // rester gérée par l'utilisateur.
    return url.protocol === 'http:' && local && (url.pathname === '/' || url.pathname === '')
  } catch {
    return false
  }
}

function messageFromBody(body: unknown, status: number): string {
  if (!body || typeof body !== 'object') return `Erreur API BL (${status}).`
  const record = body as Record<string, unknown>
  const base =
    typeof record.message === 'string' && record.message.trim() !== ''
      ? record.message
      : `Erreur API BL (${status}).`

  if (!Array.isArray(record.candidates)) return base
  const references = record.candidates
    .map((candidate) => {
      if (!candidate || typeof candidate !== 'object') return null
      const reference = (candidate as Record<string, unknown>).reference
      return typeof reference === 'string' ? reference : null
    })
    .filter((reference): reference is string => reference !== null)

  return references.length > 0 ? `${base} ${references.join(', ')}` : base
}

export async function lookupBl(number: string, configuredUrl?: string | null): Promise<BlLookup> {
  const base = blApiBaseUrl(configuredUrl)
  const url = `${base}/api/bl/${encodeURIComponent(number)}`

  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch {
    throw new Error(
      `API BL injoignable (${base}). Vérifiez l’adresse dans Paramètres ou que le service est démarré.`
    )
  }

  const text = await response.text()
  if (text.length > MAX_BODY_LENGTH) throw new Error('Réponse de l’API BL trop volumineuse.')

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error('Réponse illisible de l’API BL.')
  }

  if (!response.ok) {
    throw new Error(messageFromBody(body, response.status))
  }

  const parsed = responseSchema.safeParse(body)
  if (!parsed.success) throw new Error('Réponse inattendue de l’API BL.')

  const bl = parsed.data.bl
  return buildBlLookup({
    reference: bl.reference,
    date: bl.date,
    clientName: bl.client?.name ?? null,
    clientCode: bl.client?.code ?? null,
    lines: parsed.data.lines
  })
}

/**
 * Dump complet et non vide de chaque colonne autour d'un BL (`?full=1`).
 *
 * `SELECT *` est inutilisable sur Articles avec ce pilote : toutes les requêtes
 * passent par une liste de colonnes explicite, colonnes binaires exclues. Les
 * valeurs vides sont omises ; `/api/schema` liste toutes les colonnes.
 */
import type { Row } from './db'
import type { ColumnInfo, Schema } from './schema'
import { int } from './sql'

const DATE_TYPES = new Set(['SQL_DATE', 'SQL_TYPE_DATE'])
const TIMESTAMP_TYPES = new Set(['SQL_TIMESTAMP', 'SQL_TYPE_TIMESTAMP'])

export interface FullLine {
  line: Record<string, unknown>
  article: Record<string, unknown> | null
}

export interface FullDetails {
  header: Record<string, unknown> | null
  client: Record<string, unknown> | null
  lines: FullLine[]
}

function normalizeKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
}

/** Le pilote peut renvoyer la casse ou l'accentuation autrement que le schéma. */
export function readColumn(row: Row | undefined, name: string): unknown {
  if (!row) return undefined
  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(row, key)
  if (has(name)) return row[name]
  if (has(name.toUpperCase())) return row[name.toUpperCase()]
  if (has(name.toLowerCase())) return row[name.toLowerCase()]

  const wanted = normalizeKey(name)
  for (const key of Object.keys(row)) {
    if (normalizeKey(key) === wanted) return row[key]
  }
  return undefined
}

function toNumber(value: unknown): number | string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString()
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function formatDateText(text: string): string {
  return /^\d{8}$/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : text
}

function formatTimestampText(text: string): string {
  return /^\d{14}$/.test(text)
    ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` +
        `T${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}`
    : text
}

export function normalizeValue(value: unknown, column: ColumnInfo): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') return toNumber(value)
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()

  // Champs binaires : inutiles en JSON, déjà exclus du SELECT.
  if (typeof value === 'object') return null

  if (typeof value === 'string') {
    const text = value.trim()
    if (text === '') return null
    // HFSQL renvoie parfois \x04 pour une date vide ou invalide.
    // eslint-disable-next-line no-control-regex
    if (/^[\x00-\x08\x0B\x0C\x0E-\x1F]+$/.test(text)) return null
    if (DATE_TYPES.has(column.type)) return formatDateText(text)
    if (TIMESTAMP_TYPES.has(column.type)) return formatTimestampText(text)
    return text
  }

  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  return value
}

function rowToObject(row: Row, columns: ColumnInfo[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const column of columns) {
    const value = normalizeValue(readColumn(row, column.name), column)
    if (value !== null) result[column.name] = value
  }
  return result
}

export async function getFullDetails(
  schema: Schema,
  blType: number,
  blId: number,
  clientId: number | null
): Promise<FullDetails> {
  const [headerColumns, clientColumns, lineColumns] = await Promise.all([
    schema.selectColumns('Mouvement'),
    schema.selectColumns('Tiers'),
    schema.selectColumns('Ligne_MT')
  ])

  const [headerRows, clientRows, lineRows] = await Promise.all([
    schema.selectAll('Mouvement', `IDMOUVEMENT = ${int(blId)}`),
    clientId === null ? Promise.resolve([]) : schema.selectAll('Tiers', `IDTIERS = ${int(clientId)}`),
    schema.selectAll(
      'Ligne_MT',
      `IDMOUVEMENT = ${int(blId)}
       AND TYPE = ${int(blType)}
       AND (SOUS_TABLE = 0 OR SOUS_TABLE IS NULL)`,
      'IDLIGNE_MT'
    )
  ])

  const articleIds = [
    ...new Set(
      lineRows
        .map((row) => toNumber(readColumn(row, 'IDARTICLE')))
        .filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
    )
  ]

  let articleColumns: ColumnInfo[] = []
  let articleRows: Row[] = []
  if (articleIds.length > 0) {
    articleColumns = await schema.selectColumns('Articles')
    articleRows = await schema.selectAll(
      'Articles',
      `IDARTICLE IN (${articleIds.map((id) => int(id)).join(', ')})`
    )
  }

  const articlesById = new Map<number, Record<string, unknown>>()
  for (const row of articleRows) {
    const id = toNumber(readColumn(row, 'IDARTICLE'))
    if (typeof id === 'number') articlesById.set(id, rowToObject(row, articleColumns))
  }

  return {
    header: headerRows[0] ? rowToObject(headerRows[0], headerColumns) : null,
    client: clientRows[0] ? rowToObject(clientRows[0], clientColumns) : null,
    lines: lineRows.map((row) => {
      const articleId = toNumber(readColumn(row, 'IDARTICLE'))
      return {
        line: rowToObject(row, lineColumns),
        article: typeof articleId === 'number' ? (articlesById.get(articleId) ?? null) : null
      }
    })
  }
}

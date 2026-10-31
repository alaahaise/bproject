import type { Row } from './db'

export interface ArticleExportRow {
  IDArticle: unknown
  Reference: unknown
  Libelle: unknown
  Famille: unknown
  Sous_Famille: unknown
  Classification: unknown
  Categorie: unknown
  Unite_Mesure: unknown
  Poids_Brut: unknown
  soldBlLines: number
}

const CSV_COLUMNS = [
  'IDArticle',
  'Reference',
  'Libelle',
  'Famille',
  'Sous_Famille',
  'Classification',
  'Categorie',
  'Unite_Mesure',
  'Poids_Brut',
  'Lignes_BL_Type_23'
] as const

const FACETS = ['Famille', 'Sous_Famille', 'Classification', 'Categorie'] as const

function withoutNullPadding(value: string): string {
  let end = value.length
  while (end > 0 && value.charCodeAt(end - 1) === 0) end -= 1
  return value.slice(0, end)
}

function read(row: Row, ...names: string[]): unknown {
  const wanted = new Set(names.map((name) => name.toLocaleLowerCase()))
  const key = Object.keys(row).find((candidate) => wanted.has(candidate.toLocaleLowerCase()))
  if (key === undefined) return undefined
  const value = row[key]
  const encoding = wanted.has('reference') ? 'windows-1252' : 'utf-16le'
  if (value instanceof ArrayBuffer) {
    return withoutNullPadding(new TextDecoder(encoding).decode(value))
  }
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    return withoutNullPadding(new TextDecoder(encoding).decode(bytes))
  }
  return value
}

function cell(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function csvCell(value: unknown): string {
  const text = cell(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Joins pre-aggregated BL line counts without dropping articles that were never sold. */
export function combineArticleRows(articles: Row[], counts: Row[]): ArticleExportRow[] {
  const soldLineCounts = new Map<string, number>()
  for (const row of counts) {
    const articleId = read(row, 'articleId', 'IDArticle')
    if (articleId === null || articleId === undefined || articleId === '') continue
    const count = Number(read(row, 'lineCount', 'soldBlLines', 'count'))
    if (Number.isFinite(count) && count >= 0) soldLineCounts.set(String(articleId), count)
  }

  return articles.map((row) => {
    const id = read(row, 'IDArticle')
    return {
      IDArticle: id,
      Reference: read(row, 'Reference'),
      Libelle: read(row, 'Libelle'),
      Famille: read(row, 'Famille'),
      Sous_Famille: read(row, 'Sous_Famille'),
      Classification: read(row, 'Classification'),
      Categorie: read(row, 'Categorie'),
      Unite_Mesure: read(row, 'Unite_Mesure'),
      Poids_Brut: read(row, 'Poids_Brut'),
      soldBlLines: id === null || id === undefined ? 0 : (soldLineCounts.get(String(id)) ?? 0)
    }
  })
}

/** UTF-8 BOM and CRLF make the file open cleanly in Windows spreadsheet software. */
export function formatArticlesCsv(rows: ArticleExportRow[]): string {
  const records = [
    CSV_COLUMNS.map(csvCell).join(','),
    ...rows.map((row) =>
      [
        row.IDArticle,
        row.Reference,
        row.Libelle,
        row.Famille,
        row.Sous_Famille,
        row.Classification,
        row.Categorie,
        row.Unite_Mesure,
        row.Poids_Brut,
        row.soldBlLines
      ]
        .map(csvCell)
        .join(',')
    )
  ]
  return `\uFEFF${records.join('\r\n')}\r\n`
}

/** Counts articles for each exact HFSQL facet and includes up to three labels as examples. */
export function summarizeArticleFacets(rows: ArticleExportRow[]): string {
  const output: string[] = []
  for (const facet of FACETS) {
    const groups = new Map<string, { count: number; labels: Set<string> }>()
    for (const row of rows) {
      const value = cell(row[facet]).trim() || '(vide)'
      const label = cell(row.Libelle).trim()
      const group = groups.get(value) ?? { count: 0, labels: new Set<string>() }
      group.count += 1
      if (label !== '' && group.labels.size < 3) group.labels.add(label)
      groups.set(value, group)
    }
    for (const [value, group] of [...groups].sort(([a], [b]) => a.localeCompare(b, 'fr')))
      output.push(
        `${facet}: ${value} | ${group.count} article(s) | exemples : ${
          [...group.labels].join(' / ') || '—'
        }`
      )
  }
  return output.join('\n')
}

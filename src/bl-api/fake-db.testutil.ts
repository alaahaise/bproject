/**
 * Fausse base pour les tests : répond aux requêtes du service d'après des
 * fragments de SQL. Elle vérifie la logique (mapping, poids, ambiguïté,
 * cache), PAS la validité du SQL côté HFSQL : pour cela, `npm run bl:probe`.
 */
import type { Db, Row } from './db'

export type Handler = (sql: string) => Row[] | undefined

export function fakeDb(handler: Handler): Db & { queries: string[] } {
  const queries: string[] = []
  return {
    queries,
    async query(sql) {
      queries.push(sql)
      const rows = handler(sql)
      if (!rows) throw new Error(`fake db: requête inattendue : ${sql.slice(0, 80)}`)
      return rows
    },
    async columns() {
      return []
    },
    async close() {}
  }
}

const header = (id: number, reference: string, year: number, clientId = 105): Row => ({
  id,
  reference,
  docYear: year,
  docNumber: 5255,
  docDate: `${year}0701`,
  docTime: '10:34:00.000',
  deliveryDate: `${year}0701`,
  status: 1,
  clientId,
  totalHt: 89200,
  totalTtc: 89200
})

export const ARTICLES: Row[] = [
  { id: 230, code: 'VIG 1L', name: 'Vigosine 1L', weight: 0 },
  { id: 231, code: 'INT A+', name: 'Introvit A+', weight: 0 }
]

const line = (lineId: number, articleId: number, quantity: number): Row => ({
  lineId,
  articleId,
  quantity,
  weight: 0,
  unitWeight: 0,
  totalHt: 1
})

/** BL26-05255 (3 lignes, 2 + 6 + 12 quintaux) et BL25-05255 (même numéro, 2025). */
export function blHandler(overrides: { lines?: Row[]; articles?: Row[] } = {}): Handler {
  return (sql) => {
    if (/COUNT\(\*\)/.test(sql)) return [{ n: 37856 }]
    if (/FROM Mouvement/.test(sql)) {
      if (/Reference = 'BL26-05255'/.test(sql) || /Annee = 2026/.test(sql)) {
        return [header(39394, 'BL26-05255', 2026)]
      }
      if (/Annee = 2025/.test(sql)) return [header(30001, 'BL25-05255', 2025)]
      if (/Numero = 5255/.test(sql)) {
        return [header(39394, 'BL26-05255', 2026), header(30001, 'BL25-05255', 2025)]
      }
      return []
    }
    if (/FROM Tiers/.test(sql)) {
      return [{ id: 105, code: '78', name: 'HANGAR AIN NOUISSY', owner: 'SID AHMED MANSOUR' }]
    }
    if (/FROM Articles/.test(sql)) return overrides.articles ?? ARTICLES
    if (/FROM Ligne_MT/.test(sql)) {
      return overrides.lines ?? [line(1, 230, 2), line(2, 231, 6), line(3, 231, 12)]
    }
    return undefined
  }
}

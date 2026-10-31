/**
 * Lecture d'un BL dans HFSQL : en-tête (Mouvement), client (Tiers), lignes
 * (Ligne_MT) et articles. Lecture seule : seuls des SELECT sont émis.
 *
 * Les requêtes SQL sont celles validées sur la base réelle ; ne les modifiez
 * qu'avec un test contre HFSQL (`npm run bl:probe`).
 */
import { parseBlInput, type ParsedBlNumber } from '@shared/domain/bl-number'
import { searchArticleCatalog } from '@shared/domain/article-catalog'
import { resolveLineWeight, round3, summarizeWeights } from '@shared/domain/bl-weight'
import type { ArticleCatalogGroup, ArticleOption } from '@shared/types'
import type { BlApiConfig } from './config'
import type { Db, Row } from './db'
import { getFullDetails } from './full-details'
import type { Schema } from './schema'
import { int, quoteString } from './sql'
import type { BlAmbiguous, BlCandidate, BlClientDto, BlLineDto, BlResult } from './types'

const HEADER_SELECT = `
  SELECT IDMouvement AS id,
         Reference AS reference,
         Annee AS docYear,
         Numero AS docNumber,
         Date AS docDate,
         Heure AS docTime,
         Date_Livraison AS deliveryDate,
         Statut AS status,
         IdTiers AS clientId,
         HT AS totalHt,
         TTC AS totalTtc
    FROM Mouvement`

/** Un article absent du cache ne relance pas le rechargement plus d'une fois par intervalle. */
const MIN_FORCED_RELOAD_MS = 10_000
const MAX_CANDIDATES = 20

interface ArticleInfo {
  code: string | null
  name: string | null
  barcode: string | null
  familyId: number | null
  subFamilyId: number | null
  unitId: number | null
  classification: number | null
  category: number | null
  weight: number | null
}

/** Le pilote peut renvoyer l'alias tel quel, en majuscules ou en minuscules. */
function read(row: Row | undefined, key: string): unknown {
  if (!row) return undefined
  if (key in row) return row[key]
  if (key.toUpperCase() in row) return row[key.toUpperCase()]
  if (key.toLowerCase() in row) return row[key.toLowerCase()]
  return undefined
}

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'bigint' ? Number(value) : Number(value)
  return Number.isFinite(number) ? number : null
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function formatDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const text = String(value).trim()
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  return null
}

interface Header {
  id: number | null
  reference: string | null
  year: number | null
  number: number | null
  date: string | null
  time: string | null
  deliveryDate: string | null
  status: number | null
  clientId: number | null
  totalHt: number | null
  totalTtc: number | null
}

function mapHeader(row: Row): Header {
  return {
    id: toNumber(read(row, 'id')),
    reference: clean(read(row, 'reference')),
    year: toNumber(read(row, 'docYear')),
    number: toNumber(read(row, 'docNumber')),
    date: formatDate(read(row, 'docDate')),
    time: clean(read(row, 'docTime')),
    deliveryDate: formatDate(read(row, 'deliveryDate')),
    status: toNumber(read(row, 'status')),
    clientId: toNumber(read(row, 'clientId')),
    totalHt: toNumber(read(row, 'totalHt')),
    totalTtc: toNumber(read(row, 'totalTtc'))
  }
}

export interface GetBlOptions {
  full?: boolean
}

export interface BlService {
  getBl(parsed: ParsedBlNumber, options?: GetBlOptions): Promise<BlResult | BlAmbiguous | null>
  getClient(clientId: number | null): Promise<BlClientDto | null>
  searchArticles(query: string, group: ArticleCatalogGroup): Promise<ArticleOption[]>
}

export function createBlService(
  db: Db,
  schema: Schema,
  config: Pick<BlApiConfig, 'blType' | 'articleCacheTtlMs'>,
  now: () => number = Date.now
): BlService {
  let articleCache = {
    loadedAt: 0,
    forcedAt: 0,
    hasLoaded: false,
    map: new Map<number, ArticleInfo>()
  }
  let articleLoadPromise: Promise<Map<number, ArticleInfo>> | null = null

  async function loadArticles(force = false): Promise<Map<number, ArticleInfo>> {
    const age = now() - articleCache.loadedAt
    const fresh = articleCache.hasLoaded && age < config.articleCacheTtlMs
    if (fresh && !force) return articleCache.map
    // Un rechargement forcé trop rapproché est ignoré (article supprimé dans HFSQL).
    if (force && now() - articleCache.forcedAt < MIN_FORCED_RELOAD_MS && articleCache.map.size > 0) {
      return articleCache.map
    }

    if (articleLoadPromise) return articleLoadPromise

    const loading = (async () => {
      const rows = await db.query(
      `SELECT IDArticle AS id,
              Reference AS code,
              Libelle AS name,
              Code_Barres AS barcode,
              Famille AS familyId,
              Sous_Famille AS subFamilyId,
              Unite_Mesure AS unitId,
              Classification AS classification,
              Categorie AS category,
              Poids_Brut AS weight
         FROM Articles`
      )

      const map = new Map<number, ArticleInfo>()
      for (const row of rows) {
        const id = toNumber(read(row, 'id'))
        if (id === null) continue
        map.set(id, {
          code: clean(read(row, 'code')),
          name: clean(read(row, 'name')),
          barcode: clean(read(row, 'barcode')),
          familyId: toNumber(read(row, 'familyId')),
          subFamilyId: toNumber(read(row, 'subFamilyId')),
          unitId: toNumber(read(row, 'unitId')),
          classification: toNumber(read(row, 'classification')),
          category: toNumber(read(row, 'category')),
          weight: toNumber(read(row, 'weight'))
        })
      }

      articleCache = {
        loadedAt: now(),
        forcedAt: force ? now() : articleCache.forcedAt,
        hasLoaded: true,
        map
      }
      return map
    })()
    articleLoadPromise = loading
    try {
      return await loading
    } finally {
      if (articleLoadPromise === loading) articleLoadPromise = null
    }
  }

  async function getClient(clientId: number | null): Promise<BlClientDto | null> {
    if (!clientId) return null

    const rows = await db.query(
      `SELECT IdTiers AS id,
              Code AS code,
              Libelle AS name,
              Proprietaire AS owner,
              Activite AS activity,
              Adr_Facturation AS address,
              Telephone AS phone,
              Mobile AS mobile,
              Email AS email,
              IdentFiscal AS taxId
         FROM Tiers
        WHERE IdTiers = ${int(clientId)}`
    )

    const row = rows[0]
    if (!row) return null
    return {
      id: toNumber(read(row, 'id')),
      code: clean(read(row, 'code')),
      name: clean(read(row, 'name')),
      owner: clean(read(row, 'owner')),
      activity: clean(read(row, 'activity')),
      address: clean(read(row, 'address')),
      phone: clean(read(row, 'phone')),
      mobile: clean(read(row, 'mobile')),
      email: clean(read(row, 'email')),
      taxId: clean(read(row, 'taxId'))
    }
  }

  async function searchArticles(
    query: string,
    group: ArticleCatalogGroup
  ): Promise<ArticleOption[]> {
    const articles = await loadArticles()
    return searchArticleCatalog(
      [...articles].map(([id, article]) => ({ id, code: article.code, name: article.name })),
      query,
      group,
      50
    )
  }

  async function getLines(blId: number): Promise<BlLineDto[]> {
    const rows = await db.query(
      `SELECT IDLigne_MT AS lineId,
              IDArticle AS articleId,
              Libelle AS lineLabel,
              Qte AS quantity,
              Nbr_Colis AS packages,
              Colisage AS packaging,
              Qte_Vrac AS quantityVrac,
              Poids AS weight,
              POIDS_UN AS unitWeight,
              Ref_Lot AS lot,
              D_Peremption AS expiryDate,
              Prix_HT AS unitPriceHt,
              Resultat_HT AS totalHt
         FROM Ligne_MT
        WHERE IDMouvement = ${int(blId)}
          AND Type = ${int(config.blType)}
          AND (Sous_Table = 0 OR Sous_Table IS NULL)
        ORDER BY IDLigne_MT`
    )

    let articles = await loadArticles()
    const missing = rows.some((row) => {
      const id = toNumber(read(row, 'articleId'))
      return id !== null && !articles.has(id)
    })
    if (missing) articles = await loadArticles(true)

    return rows.map((row): BlLineDto => {
      const articleId = toNumber(read(row, 'articleId'))
      const article = articleId !== null ? (articles.get(articleId) ?? null) : null
      const quantity = toNumber(read(row, 'quantity'))
      const lineWeight = toNumber(read(row, 'weight'))
      const resolved = resolveLineWeight({
        quantity,
        lineWeight,
        unitWeight: toNumber(read(row, 'unitWeight')),
        articleWeight: article?.weight ?? null
      })

      return {
        lineId: toNumber(read(row, 'lineId')),
        articleId,
        code: article?.code ?? null,
        name: article?.name || clean(read(row, 'lineLabel')),
        barcode: article?.barcode ?? null,
        familyId: article?.familyId ?? null,
        subFamilyId: article?.subFamilyId ?? null,
        unitId: article?.unitId ?? null,
        classification: article?.classification ?? null,
        category: article?.category ?? null,
        quantity,
        packages: toNumber(read(row, 'packages')),
        packaging: toNumber(read(row, 'packaging')),
        quantityVrac: toNumber(read(row, 'quantityVrac')),
        weight: lineWeight,
        weightKg: resolved.weightKg,
        unitWeightKg: resolved.unitWeightKg,
        weightSource: resolved.weightSource,
        lot: clean(read(row, 'lot')),
        expiryDate: formatDate(read(row, 'expiryDate')),
        unitPriceHt: toNumber(read(row, 'unitPriceHt')),
        totalHt: toNumber(read(row, 'totalHt'))
      }
    })
  }

  function findHeaders(parsed: ParsedBlNumber): Promise<Row[]> {
    const { reference, year, number } = parsed
    const type = int(config.blType)

    if (reference) {
      return db.query(
        `${HEADER_SELECT}
          WHERE Type = ${type} AND Reference = ${quoteString(reference)}
          ORDER BY Annee DESC`
      )
    }

    if (number === null) return Promise.resolve([])

    if (year !== null) {
      return db.query(
        `${HEADER_SELECT}
          WHERE Type = ${type}
            AND Annee = ${int(year)}
            AND Numero = ${int(number)}
          ORDER BY IDMouvement DESC`
      )
    }

    return db.query(
      `${HEADER_SELECT}
        WHERE Type = ${type} AND Numero = ${int(number)}
        ORDER BY Annee DESC`
    )
  }

  async function getBl(
    parsed: ParsedBlNumber,
    options: GetBlOptions = {}
  ): Promise<BlResult | BlAmbiguous | null> {
    const rows = await findHeaders(parsed)
    if (rows.length === 0) return null

    // Un numéro seul peut exister une fois par année : l'appelant doit préciser.
    if (!parsed.reference && parsed.year === null && rows.length > 1) {
      const candidates: BlCandidate[] = []
      for (const row of rows.slice(0, MAX_CANDIDATES)) {
        const header = mapHeader(row)
        let client: BlClientDto | null = null
        try {
          client = await getClient(header.clientId)
        } catch {
          /* un candidat sans client reste utile */
        }
        candidates.push({
          reference: header.reference,
          year: header.year,
          number: header.number,
          date: header.date,
          client
        })
      }
      return { ambiguous: true, candidates }
    }

    const header = mapHeader(rows[0] as Row)
    if (header.id === null) throw new Error('BL sans identifiant HFSQL.')

    const client = await getClient(header.clientId)
    const lines = await getLines(header.id)

    const linesTotalHt = round2(lines.reduce((sum, line) => sum + (line.totalHt ?? 0), 0))
    const totalHt = header.totalHt ? round2(header.totalHt) : linesTotalHt
    const totalTtc = header.totalTtc ? round2(header.totalTtc) : totalHt
    const weights = summarizeWeights(lines)

    const full = options.full
      ? await getFullDetails(schema, config.blType, header.id, header.clientId)
      : undefined

    return {
      bl: {
        id: header.id,
        reference: header.reference,
        year: header.year,
        number: header.number,
        date: header.date,
        time: header.time,
        deliveryDate: header.deliveryDate,
        status: header.status,
        client,
        totalHt,
        totalTtc,
        lineCount: lines.length,
        totalWeightKg: weights.totalWeightKg,
        knownWeightKg: round3(weights.knownWeightKg),
        weightComplete: weights.weightComplete,
        unknownWeightLines: weights.unknownWeightLines
      },
      lines,
      ...(full ? { full } : {})
    }
  }

  return { getBl, getClient, searchArticles }
}

/** Raccourci pour les scripts : texte saisi → BL. */
export function lookup(service: BlService, raw: string, year?: string, full = false) {
  return service.getBl(parseBlInput(raw, year), { full })
}

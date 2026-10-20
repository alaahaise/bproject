/**
 * Serveur HTTP du service BL (Express). `createApp` ne lance rien : le
 * démarrage est dans main.ts, ce qui permet de tester les routes avec une
 * fausse base.
 */
import { existsSync } from 'node:fs'
import express, { type ErrorRequestHandler, type Express } from 'express'
import { BlNumberError, parseBlInput } from '@shared/domain/bl-number'
import type { BlApiConfig } from './config'
import { DatabaseUnavailableError, type Db } from './db'
import { isAmbiguous } from './types'
import type { BlService } from './bl-service'
import { UnknownTableError, type Schema } from './schema'

export interface AppDeps {
  config: Pick<BlApiConfig, 'corsOrigin' | 'publicDir'>
  db: Db
  schema: Schema
  service: BlService
  log?: (line: string) => void
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

function flag(value: unknown): boolean {
  return typeof value === 'string' && TRUE_VALUES.has(value.trim().toLowerCase())
}

export function createApp({ config, db, schema, service, log = console.log }: AppDeps): Express {
  const app = express()
  const startedAt = Date.now()

  app.disable('x-powered-by')

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')

    if (config.corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', config.corsOrigin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    }

    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })

  // Page de test, servie seulement si le dossier existe (absent en production).
  if (existsSync(config.publicDir)) app.use(express.static(config.publicDir))

  app.use((req, res, next) => {
    const began = process.hrtime.bigint()
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - began) / 1e6
      log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms.toFixed(0)} ms)`)
    })
    next()
  })

  /**
   * Liveness : le service tourne. Ne touche PAS à HFSQL, pour que l'application
   * sache tout de suite que le service est prêt même si la base est coupée.
   */
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) })
  })

  /** État de la base : 200 si HFSQL répond, 503 sinon (avec la cause). */
  app.get('/api/status', async (_req, res, next) => {
    const began = Date.now()
    try {
      const rows = await db.query('SELECT COUNT(*) AS n FROM Mouvement')
      const first = rows[0]
      const count = first ? Number(first.n ?? first.N ?? Object.values(first)[0]) : null
      res.json({ ok: true, database: 'connected', movements: count, latencyMs: Date.now() - began })
    } catch (error) {
      if (error instanceof DatabaseUnavailableError) {
        res.status(503).json({ ok: false, database: 'unreachable', message: error.message })
        return
      }
      next(error)
    }
  })

  app.get('/api/schema', async (req, res, next) => {
    try {
      const table = typeof req.query.table === 'string' && req.query.table ? req.query.table : null
      res.json({ tables: await schema.summary(table) })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/bl/:number', async (req, res, next) => {
    try {
      const year = typeof req.query.year === 'string' ? req.query.year : undefined
      const parsed = parseBlInput(req.params.number, year)
      const result = await service.getBl(parsed, {
        full: flag(req.query.full) || flag(req.query.all)
      })

      if (!result) {
        res.status(404).json({
          found: false,
          error: 'not_found',
          message: `Aucun BL trouvé pour « ${req.params.number} ».`
        })
        return
      }

      if (isAmbiguous(result)) {
        res.status(409).json({
          found: false,
          error: 'ambiguous_number',
          message: 'Ce numéro de BL existe pour plusieurs années. Précisez l’année :',
          candidates: result.candidates
        })
        return
      }

      res.json({ found: true, ...result })
    } catch (error) {
      next(error)
    }
  })

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'Route API inconnue.' })
  })

  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof BlNumberError) {
      res.status(400).json({ error: 'bad_request', message: error.message })
      return
    }
    if (error instanceof UnknownTableError) {
      res.status(400).json({ error: 'unknown_table', message: error.message })
      return
    }
    if (error instanceof DatabaseUnavailableError) {
      log(`Base HFSQL indisponible : ${error.message}`)
      res.status(503).json({
        error: 'database_unavailable',
        message: 'La base HFSQL est injoignable. Vérifiez la connexion au serveur puis réessayez.'
      })
      return
    }
    console.error('Request failed:', error)
    res.status(500).json({ error: 'database_error', message: 'La requête HFSQL a échoué.' })
  }
  app.use(onError)

  return app
}

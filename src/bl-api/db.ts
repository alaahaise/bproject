/**
 * Accès ODBC à HFSQL : une connexion partagée, des requêtes sérialisées.
 *
 * Choix de conception :
 * - la connexion est ouverte à la demande, pas au démarrage : le service doit
 *   pouvoir démarrer (et le dire) quand HFSQL est injoignable, par exemple en
 *   télétravail, puis se rétablir seul quand la base revient ;
 * - les délais sont appliqués ici, en JavaScript, plutôt que par les options
 *   ODBC : tous les pilotes ne les supportent pas, celui de HFSQL est inconnu ;
 * - une requête qui dépasse son délai fait jeter la connexion (la suivante en
 *   rouvre une) pour qu'une requête bloquée ne gèle pas toutes les autres ;
 * - une connexion coupée est rouverte une fois, sans risque : le service ne
 *   fait que des SELECT.
 */
import type { BlApiConfig } from './config'

export type Row = Record<string, unknown>

/** Sous-ensemble de `odbc` utilisé ici (permet de le remplacer dans les tests). */
export interface OdbcConnection {
  query(sql: string): Promise<ArrayLike<Row>>
  columns(catalog: null, schema: null, table: string, column: null): Promise<ArrayLike<Row>>
  close(): Promise<void>
}
export interface OdbcModule {
  connect(connectionString: string): Promise<OdbcConnection>
}

export interface Db {
  query(sql: string): Promise<Row[]>
  columns(table: string): Promise<Row[]>
  close(): Promise<void>
}

/** HFSQL est injoignable (réseau, serveur arrêté, délai dépassé). */
export class DatabaseUnavailableError extends Error {
  readonly code = 'DATABASE_UNAVAILABLE'

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DatabaseUnavailableError'
  }
}

class TimeoutError extends Error {}

const CONNECTION_MESSAGE =
  /connection|communication|link|socket|network|not connected|closed|eof|connexion|perdue|r[ée]seau/i

function describe(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message ?? error ?? '')
}

/**
 * Erreur de connexion plutôt que de SQL ? On regarde d'abord le SQLSTATE
 * (classe 08 = problème de connexion), indépendant de la langue du pilote, puis
 * le texte (le pilote HFSQL répond en français).
 */
export function isConnectionError(error: unknown): boolean {
  const states = (error as { odbcErrors?: Array<{ state?: unknown }> } | null)?.odbcErrors
  if (Array.isArray(states) && states.some((entry) => String(entry?.state ?? '').startsWith('08'))) {
    return true
  }
  return CONNECTION_MESSAGE.test(describe(error))
}

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${label} : délai de ${ms} ms dépassé`)), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

/** `odbc` est un module CommonJS natif : selon le chargeur, `connect` est sur `default` ou sur le module. */
async function loadNativeOdbc(): Promise<OdbcModule> {
  const loaded = (await import('odbc')) as unknown as Partial<OdbcModule> & { default?: OdbcModule }
  return (loaded.default ?? loaded) as OdbcModule
}

type DbConfig = Pick<BlApiConfig, 'connectionString' | 'connectTimeoutMs' | 'queryTimeoutMs'>

export function createDb(
  config: DbConfig,
  loadOdbc: () => Promise<OdbcModule> = loadNativeOdbc
): Db {
  let connection: OdbcConnection | null = null
  let opening: Promise<OdbcConnection> | null = null
  let queue: Promise<unknown> = Promise.resolve()

  async function open(): Promise<OdbcConnection> {
    if (connection) return connection
    opening ??= (async () => {
      try {
        const odbc = await loadOdbc()
        const opened = await withTimeout(
          odbc.connect(config.connectionString),
          config.connectTimeoutMs,
          'Connexion HFSQL'
        )
        connection = opened
        return opened
      } catch (error) {
        throw new DatabaseUnavailableError(`HFSQL injoignable : ${describe(error)}`, {
          cause: error
        })
      } finally {
        opening = null
      }
    })()
    return opening
  }

  async function discard(broken: OdbcConnection): Promise<void> {
    if (connection === broken) connection = null
    try {
      await broken.close()
    } catch {
      /* déjà fermée ou bloquée : rien à faire */
    }
  }

  async function run<T>(label: string, work: (c: OdbcConnection) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const current = await open()
      try {
        return await withTimeout(work(current), config.queryTimeoutMs, label)
      } catch (error) {
        if (error instanceof TimeoutError) {
          // On ne rejoue pas : on a déjà attendu le délai complet.
          void discard(current)
          throw new DatabaseUnavailableError(`HFSQL ne répond pas : ${error.message}`, {
            cause: error
          })
        }
        if (!isConnectionError(error)) throw error
        await discard(current)
        if (attempt >= 1) {
          throw new DatabaseUnavailableError(`Connexion HFSQL perdue : ${describe(error)}`, {
            cause: error
          })
        }
      }
    }
  }

  /** Une seule requête à la fois sur la connexion partagée. */
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task)
    queue = result.catch(() => undefined)
    return result
  }

  return {
    query: (sql) => enqueue(async () => Array.from(await run('Requête', (c) => c.query(sql)))),
    columns: (table) =>
      enqueue(async () =>
        Array.from(await run(`Colonnes de ${table}`, (c) => c.columns(null, null, table, null)))
      ),
    close: async () => {
      const current = connection
      connection = null
      if (current) {
        try {
          await current.close()
        } catch {
          /* ignoré à l'arrêt */
        }
      }
    }
  }
}

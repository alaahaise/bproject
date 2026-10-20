/**
 * Configuration du service BL, lue dans l'environnement (.env ou variables
 * transmises par l'application Electron).
 */
import { join } from 'node:path'

export interface BlApiConfig {
  port: number
  /** Vide = toutes les interfaces. */
  host: string
  /** Chaîne ODBC, ex. `DSN=commercial`. Peut contenir un mot de passe. */
  connectionString: string
  /** Type de pièce HFSQL d'un bon de livraison (Mouvement.Type). */
  blType: number
  articleCacheTtlMs: number
  /** Délai maximal pour ouvrir la connexion ODBC. */
  connectTimeoutMs: number
  /** Délai maximal pour une requête ; au-delà la connexion est jetée. */
  queryTimeoutMs: number
  corsOrigin: string | null
  /** Dossier de la page de test ; ignorée s'il n'existe pas. */
  publicDir: string
}

function integer(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value)) throw new Error(`${key} doit être un entier (reçu « ${raw} »).`)
  return value
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BlApiConfig {
  const connectionString = env.HFSQL_CONN?.trim() ?? ''
  if (!connectionString) {
    throw new Error(
      'HFSQL_CONN n’est pas défini. Copiez .env.example en .env et configurez la connexion HFSQL.'
    )
  }

  const port = integer(env, 'PORT', 3100)
  if (port < 1 || port > 65535) throw new Error(`PORT invalide : ${port}.`)

  return {
    port,
    host: env.HOST?.trim() ?? '',
    connectionString,
    blType: integer(env, 'BL_TYPE', 23),
    articleCacheTtlMs: integer(env, 'ARTICLE_CACHE_TTL_MS', 60_000),
    connectTimeoutMs: integer(env, 'HFSQL_CONNECT_TIMEOUT_MS', 6_000),
    queryTimeoutMs: integer(env, 'HFSQL_QUERY_TIMEOUT_MS', 10_000),
    corsOrigin: env.CORS_ORIGIN?.trim() || null,
    publicDir: env.BL_API_PUBLIC_DIR?.trim() || join(process.cwd(), 'src', 'bl-api', 'public')
  }
}

/** Masque le mot de passe d'une chaîne ODBC avant de l'écrire dans un log. */
export function maskConnectionString(value: string): string {
  return value.replace(/(PWD|PASSWORD|PWDXX)\s*=\s*[^;]*/gi, '$1=***')
}

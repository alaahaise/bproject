/**
 * Point d'entrée du service BL (processus séparé : le pilote ODBC est une
 * dépendance native que le processus principal d'Electron ne doit pas charger).
 *
 * Lancé par l'application (src/main/bl/process.ts) ou à la main avec
 * `npm run bl:start` pour un service partagé sur le réseau local.
 */
import 'dotenv/config'
import type { Server } from 'node:http'
import { loadConfig, maskConnectionString } from './config'
import { createDb } from './db'
import { createBlService } from './bl-service'
import { createSchema } from './schema'
import { createApp } from './server'

function main(): void {
  const config = loadConfig()
  const db = createDb(config)
  const schema = createSchema(db)
  const service = createBlService(db, schema, config)
  const app = createApp({ config, db, schema, service })

  const onListening = (): void => {
    console.log(`BL API listening on http://${config.host || 'localhost'}:${config.port}`)
    console.log(`Database: ${maskConnectionString(config.connectionString)}`)
    // Premier contact avec HFSQL, sans bloquer ni arrêter le service s'il échoue :
    // la connexion sera retentée à la première requête.
    db.query('SELECT COUNT(*) AS n FROM Mouvement').then(
      () => console.log('HFSQL: connecté.'),
      (error: unknown) =>
        console.warn(
          `HFSQL: injoignable pour l’instant (${error instanceof Error ? error.message : String(error)}). Nouvelle tentative à la prochaine requête.`
        )
    )
  }

  const server: Server = config.host
    ? app.listen(config.port, config.host, onListening)
    : app.listen(config.port, onListening)

  server.on('error', (error) => {
    console.error('Failed to start:', error)
    process.exit(1)
  })

  async function shutdown(signal: string): Promise<void> {
    console.log(`\n${signal} received, shutting down...`)
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await db.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

try {
  main()
} catch (error) {
  console.error('Failed to start:', error instanceof Error ? error.message : error)
  process.exit(1)
}

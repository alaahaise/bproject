/**
 * Démarrage du service BL local avec l'application.
 *
 * Le service reste un processus séparé : l'API utilise le pilote ODBC HFSQL,
 * et le processus principal Electron ne doit pas charger cette dépendance
 * native ni bloquer sa boucle d'événements. On relance le binaire Electron en
 * mode Node (`ELECTRON_RUN_AS_NODE`) pour ne pas dépendre d'un Node installé
 * sur le poste.
 *
 * Si une API tourne déjà (par exemple lancée à la main), on la réutilise.
 * Si l'adresse configurée est distante, on ne démarre rien.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { app } from 'electron'
import { blApiBaseUrl, isLocalBlApiUrl } from './bl-api'

const START_TIMEOUT_MS = 20_000
const HEALTH_TIMEOUT_MS = 1_000
const HEALTH_INTERVAL_MS = 400

// Une application lancée sans console (ou dont le terminal a été fermé) peut
// avoir un stdout déjà fermé. `console.log` lève alors EPIPE et ferait afficher
// le dialogue « A JavaScript error occurred in the main process ». Les logs du
// service ne doivent jamais arrêter l'application.
function safeLog(level: 'log' | 'warn' | 'error', message: string): void {
  try {
    console[level](message)
  } catch {
    // stdout/stderr fermé : ignorer.
  }
}

function ignoreClosedStreams(): void {
  for (const stream of [process.stdout, process.stderr]) {
    stream?.on('error', () => {
      // EPIPE quand le terminal ou le processus parent a disparu.
    })
  }
}

ignoreClosedStreams()

let child: ChildProcess | null = null
let childBase: string | null = null
let starting: Promise<void> | null = null
let stopping = false

function apiRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'bl-api')
    : resolve(app.getAppPath(), '..')
}

function apiScript(): string {
  return join(apiRoot(), 'src', 'server.js')
}

function wait(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

async function isHealthy(base: string): Promise<boolean> {
  try {
    const response = await fetch(`${base}/api/health`, {
      redirect: 'error',
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
    })
    return response.ok
  } catch {
    return false
  }
}

function logChunk(stream: 'stdout' | 'stderr', chunk: Buffer): void {
  const text = chunk.toString('utf8').trim()
  if (text) safeLog('log', `[bl-api:${stream}] ${text}`)
}

function stopChild(processToStop: ChildProcess): void {
  if (processToStop.exitCode !== null) return
  try {
    processToStop.kill()
  } catch {
    // Le processus a déjà pu disparaître entre le test et le kill.
  }
}

export function stopBlApi(): void {
  stopping = true
  const current = child
  child = null
  childBase = null
  if (current) stopChild(current)
}

async function waitForHealthy(base: string, processToWait: ChildProcess): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (processToWait.exitCode !== null) {
      throw new Error(
        `Le service BL s'est arrêté au démarrage (code ${processToWait.exitCode}).`
      )
    }
    if (await isHealthy(base)) return
    await wait(HEALTH_INTERVAL_MS)
  }
  throw new Error(`Le service BL n'a pas répondu sur ${base}.`)
}

async function start(base: string): Promise<void> {
  const script = apiScript()
  if (!existsSync(script)) {
    throw new Error(`Service BL introuvable : ${script}`)
  }

  const root = apiRoot()
  const url = new URL(base)
  const port = url.port || (url.protocol === 'https:' ? '443' : '80')
  // Le service local n'a pas d'authentification : quand l'adresse par défaut
  // est 127.0.0.1, on le limite à la boucle locale. Un service autonome
  // (`npm start`) reste joignable sur le LAN pour les autres postes.
  const environment = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    PORT: port,
    ...(url.hostname === '127.0.0.1' ? { HOST: '127.0.0.1' } : {})
  }

  stopping = false
  const processToStart = spawn(process.execPath, [script], {
    cwd: root,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  child = processToStart
  childBase = base

  processToStart.stdout?.on('data', (chunk: Buffer) => logChunk('stdout', chunk))
  processToStart.stderr?.on('data', (chunk: Buffer) => logChunk('stderr', chunk))
  processToStart.on('error', (error) => {
    safeLog('error', `[bl-api] erreur du processus : ${error.message}`)
  })
  processToStart.on('exit', (code, signal) => {
    if (child === processToStart) {
      child = null
      childBase = null
    }
    if (!stopping) {
      safeLog('warn', `[bl-api] arrêté (code ${code ?? '—'}, signal ${signal ?? '—'}).`)
    }
  })

  try {
    await waitForHealthy(base, processToStart)
    safeLog('log', `[bl-api] service prêt sur ${base}`)
  } catch (error) {
    stopChild(processToStart)
    if (child === processToStart) {
      child = null
      childBase = null
    }
    throw error
  }
}

/**
 * Garantit qu'une API locale répond. Une API déjà lancée n'est pas tuée.
 * Lève une erreur explicite si le démarrage échoue.
 */
export async function ensureBlApi(configuredUrl?: string | null): Promise<void> {
  const base = blApiBaseUrl(configuredUrl)
  if (!isLocalBlApiUrl(base)) return

  if (starting) return starting

  if (child && childBase !== base) stopBlApi()
  if (child) {
    if (await isHealthy(base)) return
    stopBlApi()
  }

  if (await isHealthy(base)) return
  if (starting) return starting

  starting = start(base).finally(() => {
    starting = null
  })
  return starting
}

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createBlService } from './bl-service'
import { DatabaseUnavailableError, type Db } from './db'
import { createSchema } from './schema'
import { createApp } from './server'
import { blHandler, fakeDb } from './fake-db.testutil'

let server: Server | null = null

async function start(db: Db): Promise<string> {
  const schema = createSchema(db)
  const service = createBlService(db, schema, { blType: 23, articleCacheTtlMs: 60_000 })
  const app = createApp({
    config: { corsOrigin: null, publicDir: '/nonexistent' },
    db,
    schema,
    service,
    log: () => undefined
  })
  const listening = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  server = listening
  return `http://127.0.0.1:${(listening.address() as AddressInfo).port}`
}

const downDb: Db = {
  async query() {
    throw new DatabaseUnavailableError('HFSQL injoignable : test')
  },
  async columns() {
    throw new DatabaseUnavailableError('HFSQL injoignable : test')
  },
  async close() {}
}

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = null
})

describe('routes du service BL', () => {
  it('/api/health répond sans toucher à HFSQL, même base coupée', async () => {
    const base = await start(downDb)
    const response = await fetch(`${base}/api/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
  })

  it('/api/status : 200 quand la base répond, 503 sinon', async () => {
    const up = await start(fakeDb(blHandler()))
    const ok = await fetch(`${up}/api/status`)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ database: 'connected', movements: 37856 })

    await new Promise<void>((resolve) => server?.close(() => resolve()))
    const down = await start(downDb)
    const ko = await fetch(`${down}/api/status`)
    expect(ko.status).toBe(503)
    expect(await ko.json()).toMatchObject({ ok: false, database: 'unreachable' })
  })

  it('GET /api/bl/:number renvoie le BL', async () => {
    const base = await start(fakeDb(blHandler()))
    const response = await fetch(`${base}/api/bl/BL26-05255`)
    const body = (await response.json()) as { found: boolean; bl: { totalWeightKg: number } }

    expect(response.status).toBe(200)
    expect(body.found).toBe(true)
    expect(body.bl.totalWeightKg).toBe(2000)
  })

  it('404 quand le BL est inconnu', async () => {
    const base = await start(fakeDb(blHandler()))
    const response = await fetch(`${base}/api/bl/BL20-00001`)
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ found: false, error: 'not_found' })
  })

  it('400 pour un numéro illisible', async () => {
    const base = await start(fakeDb(blHandler()))
    const response = await fetch(`${base}/api/bl/abc`)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'bad_request' })
  })

  it('409 avec les candidats pour un numéro présent sur plusieurs années', async () => {
    const base = await start(fakeDb(blHandler()))
    const response = await fetch(`${base}/api/bl/5255`)
    const body = (await response.json()) as { error: string; candidates: Array<{ reference: string }> }

    expect(response.status).toBe(409)
    expect(body.error).toBe('ambiguous_number')
    expect(body.candidates.map((c) => c.reference)).toEqual(['BL26-05255', 'BL25-05255'])
  })

  it('503 avec un message clair quand HFSQL est injoignable', async () => {
    const base = await start(downDb)
    const response = await fetch(`${base}/api/bl/BL26-05255`)
    const body = (await response.json()) as { error: string; message: string }

    expect(response.status).toBe(503)
    expect(body.error).toBe('database_unavailable')
    expect(body.message).toMatch(/injoignable/)
  })

  it('404 JSON pour une route inconnue', async () => {
    const base = await start(fakeDb(blHandler()))
    const response = await fetch(`${base}/api/nope`)
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: 'not_found' })
  })
})

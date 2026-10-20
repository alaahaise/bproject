/**
 * Contrat service ↔ application : la vraie réponse du service doit être
 * acceptée par le client Electron (src/main/bl/client.ts). Si l'un des deux
 * change de forme sans l'autre, ce test casse.
 */
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { lookupBl } from '../main/bl/client'
import { createBlService } from './bl-service'
import { createSchema } from './schema'
import { createApp } from './server'
import { blHandler, fakeDb } from './fake-db.testutil'

let server: Server | null = null

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = null
})

async function baseUrl(): Promise<string> {
  const db = fakeDb(blHandler())
  const schema = createSchema(db)
  const service = createBlService(db, schema, { blType: 23, articleCacheTtlMs: 60_000 })
  const app = createApp({
    config: { corsOrigin: null, publicDir: '/nonexistent' },
    db,
    schema,
    service,
    log: () => undefined
  })
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

it("le client de l'application lit la réponse réelle du service", async () => {
  const lookup = await lookupBl('BL26-05255', await baseUrl())

  expect(lookup).toMatchObject({
    reference: 'BL26-05255',
    date: '2026-07-01',
    clientName: 'HANGAR AIN NOUISSY',
    clientCode: '78',
    totalWeightKg: 2000,
    weightComplete: true,
    unknownWeightLines: 0
  })
  expect(lookup.lines.map((l) => [l.code, l.weightKg, l.weightSource])).toEqual([
    ['VIG 1L', 200, 'quintal'],
    ['INT A+', 600, 'quintal'],
    ['INT A+', 1200, 'quintal']
  ])
})

it('un numéro ambigu remonte les références candidates à l’opérateur', async () => {
  await expect(lookupBl('5255', await baseUrl())).rejects.toThrow(/BL26-05255, BL25-05255/)
})

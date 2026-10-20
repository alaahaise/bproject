import { describe, expect, it } from 'vitest'
import { parseBlInput } from '@shared/domain/bl-number'
import { createBlService } from './bl-service'
import { createSchema } from './schema'
import { isAmbiguous, type BlResult } from './types'
import { blHandler, fakeDb } from './fake-db.testutil'

const config = { blType: 23, articleCacheTtlMs: 60_000 }

function setup(overrides?: Parameters<typeof blHandler>[0], now = () => 1_000_000) {
  const db = fakeDb(blHandler(overrides))
  const service = createBlService(db, createSchema(db), config, now)
  return { db, service }
}

async function bl(service: ReturnType<typeof setup>['service'], input: string): Promise<BlResult> {
  const result = await service.getBl(parseBlInput(input))
  if (!result || isAmbiguous(result)) throw new Error('BL attendu')
  return result
}

describe('createBlService.getBl', () => {
  it('résout BL26-05255 : client, lignes et 2 000 kg (quintaux)', async () => {
    const { service } = setup()
    const { bl: header, lines } = await bl(service, 'BL26-05255')

    expect(header.reference).toBe('BL26-05255')
    expect(header.date).toBe('2026-07-01')
    expect(header.client?.name).toBe('HANGAR AIN NOUISSY')
    expect(header.lineCount).toBe(3)
    expect(header.totalWeightKg).toBe(2000)
    expect(header.weightComplete).toBe(true)
    expect(lines.map((l) => [l.code, l.weightKg, l.weightSource])).toEqual([
      ['VIG 1L', 200, 'quintal'],
      ['INT A+', 600, 'quintal'],
      ['INT A+', 1200, 'quintal']
    ])
  })

  it("renvoie null quand aucun BL ne correspond", async () => {
    const { service } = setup()
    expect(await service.getBl(parseBlInput('BL20-00001'))).toBeNull()
  })

  it('signale un numéro seul présent sur plusieurs années', async () => {
    const { service } = setup()
    const result = await service.getBl(parseBlInput('5255'))

    expect(result && isAmbiguous(result)).toBe(true)
    if (!result || !isAmbiguous(result)) return
    expect(result.candidates.map((c) => c.reference)).toEqual(['BL26-05255', 'BL25-05255'])
    expect(result.candidates[0]?.client?.name).toBe('HANGAR AIN NOUISSY')
  })

  it("lève l'ambiguïté avec l'année", async () => {
    const { service } = setup()
    const result = await service.getBl(parseBlInput('5255', '2025'))
    expect(result && !isAmbiguous(result) && result.bl.reference).toBe('BL25-05255')
  })

  it("n'annonce aucun total quand une ligne n'a ni poids ni quantité", async () => {
    const { service } = setup({
      lines: [
        { lineId: 1, articleId: 230, quantity: 2, weight: 0, unitWeight: 0 },
        { lineId: 2, articleId: 231, quantity: 0, weight: 0, unitWeight: 0 }
      ]
    })
    const { bl: header } = await bl(service, 'BL26-05255')

    expect(header.weightComplete).toBe(false)
    expect(header.totalWeightKg).toBeNull()
    expect(header.knownWeightKg).toBe(200)
    expect(header.unknownWeightLines).toBe(1)
  })

  it("préfère le poids de l'article quand il existe", async () => {
    const { service } = setup({
      articles: [{ id: 230, code: 'SAC', name: 'Sac 25 kg', weight: 25 }],
      lines: [{ lineId: 1, articleId: 230, quantity: 4, weight: 0, unitWeight: 0 }]
    })
    const { lines } = await bl(service, 'BL26-05255')
    expect(lines[0]).toMatchObject({ weightKg: 100, weightSource: 'article' })
  })

  it("retombe sur le libellé de la ligne quand l'article est inconnu", async () => {
    const { service } = setup({
      lines: [{ lineId: 1, articleId: 999, lineLabel: 'Ligne libre', quantity: 1 }]
    })
    const { lines } = await bl(service, 'BL26-05255')
    expect(lines[0]).toMatchObject({ code: null, name: 'Ligne libre' })
  })
})

describe('cache des articles', () => {
  const articleQueries = (db: ReturnType<typeof setup>['db']) =>
    db.queries.filter((sql) => /FROM Articles/.test(sql)).length

  it('ne recharge pas la table à chaque BL', async () => {
    const { db, service } = setup()
    await bl(service, 'BL26-05255')
    await bl(service, 'BL26-05255')
    expect(articleQueries(db)).toBe(1)
  })

  it('un article supprimé ne relance pas un rechargement à chaque recherche', async () => {
    let time = 1_000_000
    const { db, service } = setup(
      { lines: [{ lineId: 1, articleId: 999, quantity: 1 }] },
      () => time
    )

    await bl(service, 'BL26-05255') // chargement + rechargement forcé (article 999 absent)
    await bl(service, 'BL26-05255') // dans la fenêtre : aucun rechargement
    expect(articleQueries(db)).toBe(2)

    time += 11_000
    await bl(service, 'BL26-05255') // fenêtre écoulée : un nouveau rechargement forcé est permis
    expect(articleQueries(db)).toBe(3)
  })
})

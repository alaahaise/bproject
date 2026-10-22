/**
 * Test d'intégration du dépôt, sur un vrai serveur MySQL/MariaDB.
 *
 * Les fonctions pures sont testées ailleurs ; ce qui n'est testé QUE ici, c'est
 * le SQL réellement envoyé : allocation du compteur, verrou de capture,
 * interpolation de la colonne `first_`/`second_`, et le mapping des lignes.
 *
 * Ignoré par défaut : lancé via `npm run test:db` (voir tools/db-it.sh).
 */
import mysql, { type RowDataPacket } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@shared/types'
import * as auth from '../auth'
import * as operations from './operations'
import * as vracGroups from './vrac-groups'
import * as pool from './pool'
import { migrate } from './migrate'

const enabled = process.env['INTEGRATION_DB'] === '1'

const config = {
  host: process.env['INTEGRATION_DB_HOST'] ?? '127.0.0.1',
  port: Number(process.env['INTEGRATION_DB_PORT'] ?? 3307),
  user: process.env['INTEGRATION_DB_USER'] ?? 'root',
  password: process.env['INTEGRATION_DB_PASSWORD'] ?? '',
  // Nom unique : le serveur de test est jetable, inutile de nettoyer derrière.
  database: `balance_it_${Date.now()}`
}

/** Selon le serveur, mysql2 rend une colonne JSON décodée ou en texte. */
const asJson = (value: unknown): { weight: number } =>
  typeof value === 'string' ? JSON.parse(value) : (value as { weight: number })

describe.skipIf(!enabled)('dépôt des opérations (base réelle)', () => {
  let user: SessionUser

  beforeAll(async () => {
    const bootstrap = await mysql.createConnection({ ...config, database: undefined })
    await bootstrap.query(`CREATE DATABASE \`${config.database}\` CHARACTER SET utf8mb4`)
    await bootstrap.end()

    await pool.connect(config)
    await migrate(config)

    const password = await auth.ensureAdmin()
    const session = await auth.login('admin', password ?? 'admin')
    if (!session) throw new Error('connexion admin impossible')
    user = session
  })

  afterAll(async () => {
    await pool.disconnect()
  })

  it('crée un ticket numéroté et le laisse ouvert', async () => {
    const ticket = await operations.create(
      {
        type: 'ENTREE',
        plate: '12345-a-100',
        lines: [{ productCode: 'CIMENT', quantityKg: 5000 }]
      },
      user
    )

    expect(ticket.ticketNo).toMatch(/^E-\d{4}-\d{6}$/)
    expect(ticket.status).toBe('OUVERTE')
    expect(ticket.plate).toBe('12345-A-100') // normalisé
    expect(ticket.first).toBeNull()
    expect(ticket.netWeight).toBeNull()
    expect(ticket.operatorName).toBe('Administrateur')
    expect(ticket.lines).toEqual([{ productId: null, productCode: 'CIMENT', quantityKg: 5000 }])
  })

  it('alloue des numéros distincts et croissants', async () => {
    const first = await operations.create({ type: 'SORTIE' }, user)
    const second = await operations.create({ type: 'SORTIE' }, user)

    expect(first.ticketNo).toMatch(/^S-\d{4}-\d{6}$/)
    expect(Number(second.ticketNo.slice(-6))).toBe(Number(first.ticketNo.slice(-6)) + 1)
  })

  it('reprend la numérotation si le compteur est en retard sur les tickets existants', async () => {
    const first = await operations.create({ type: 'SORTIE' }, user)
    const scope = first.ticketNo.slice(0, first.ticketNo.lastIndexOf('-'))
    const sequence = Number(first.ticketNo.slice(-6))

    const conn = await pool.getPool().getConnection()
    try {
      await conn.query('UPDATE counters SET value = ? WHERE scope = ?', [sequence - 1, scope])
    } finally {
      conn.release()
    }

    const second = await operations.create({ type: 'SORTIE' }, user)
    expect(Number(second.ticketNo.slice(-6))).toBe(sequence + 1)
    expect(second.ticketNo).not.toBe(first.ticketNo)
  })

  it('calcule net et écart à la 2e pesée, sans enregistrer le ticket', async () => {
    const ticket = await operations.create(
      { type: 'ENTREE', lines: [{ productCode: 'CIMENT', quantityKg: 5000 }] },
      user
    )

    const afterFirst = await operations.capture(
      { operationId: ticket.id, weight: 12000, isManual: false, stableMs: 700 },
      user,
      'poste-test'
    )
    expect(afterFirst.status).toBe('OUVERTE')
    expect(afterFirst.first?.weight).toBe(12000)
    expect(afterFirst.second).toBeNull()

    const afterSecond = await operations.capture(
      { operationId: ticket.id, weight: 7000.5, isManual: false },
      user,
      'poste-test'
    )

    // Les poids sont calculés mais le ticket reste OUVERTE : c'est la
    // confirmation de l'opérateur (`close`) qui l'enregistre.
    expect(afterSecond.status).toBe('OUVERTE')
    expect(afterSecond.grossWeight).toBe(12000)
    expect(afterSecond.tareWeight).toBe(7000.5)
    expect(afterSecond.netWeight).toBe(4999.5)
    expect(afterSecond.weightSupposed).toBe(5000)
    expect(afterSecond.ecart).toBe(-0.5)
    expect(afterSecond.ecartOk).toBe(true)

    const closed = await operations.close(ticket.id, user)
    expect(closed.status).toBe('FERMEE')
    expect(closed.netWeight).toBe(4999.5)
  })

  it('refuse la 2e pesée sans produit : aucun écart à calculer', async () => {
    const ticket = await operations.create({ type: 'ENTREE' }, user)
    await operations.capture({ operationId: ticket.id, weight: 12000, isManual: false }, user, 'p')

    await expect(
      operations.capture({ operationId: ticket.id, weight: 7000, isManual: false }, user, 'p')
    ).rejects.toThrow(/au moins un produit/i)

    const reloaded = await operations.getById(ticket.id)
    expect(reloaded?.second).toBeNull()
  })

  it('somme les produits envoyés avec la 2e pesée', async () => {
    const ticket = await operations.create({ type: 'SORTIE' }, user)
    await operations.capture({ operationId: ticket.id, weight: 4000, isManual: false }, user, 'p')

    const done = await operations.capture(
      {
        operationId: ticket.id,
        weight: 10000,
        isManual: false,
        lines: [
          { productCode: 'CMV X', quantityKg: 1000 },
          { productCode: 'CMV Y', quantityKg: 4000 }
        ]
      },
      user,
      'p'
    )

    expect(done.weightSupposed).toBe(5000)
    expect(done.ecart).toBe(1000)
    expect(done.lines.map((l) => l.productCode)).toEqual(['CMV X', 'CMV Y'])
  })

  it("refuse d'enregistrer un ticket qui n'a qu'une pesée", async () => {
    const ticket = await operations.create({ type: 'SORTIE' }, user)
    await operations.capture({ operationId: ticket.id, weight: 5000, isManual: false }, user, 'p')

    await expect(operations.close(ticket.id, user)).rejects.toThrow(/deux pesées/i)
  })

  it('corrige les champs descriptifs sans toucher aux poids', async () => {
    const ticket = await operations.create(
      { type: 'ENTREE', plate: '1-A-1', lines: [{ productCode: 'SABLE', quantityKg: 6000 }] },
      user
    )
    await operations.capture({ operationId: ticket.id, weight: 10000, isManual: false }, user, 'p')
    await operations.capture({ operationId: ticket.id, weight: 4000, isManual: false }, user, 'p')

    const updated = await operations.update(ticket.id, { plate: '2-b-2', notes: 'corrigé' }, user)
    expect(updated.plate).toBe('2-B-2')
    expect(updated.notes).toBe('corrigé')
    // Les poids calculés restent ceux des pesées.
    expect(updated.netWeight).toBe(6000)
    expect(updated.grossWeight).toBe(10000)
  })

  it('remplace les produits tant que la 2e pesée n’est pas faite', async () => {
    const ticket = await operations.create({ type: 'ENTREE' }, user)
    await operations.capture({ operationId: ticket.id, weight: 10000, isManual: false }, user, 'p')

    const withLines = await operations.setLines(
      ticket.id,
      [
        { productCode: 'ORGE', quantityKg: 2000 },
        { productCode: 'MAÏS', quantityKg: 3000 }
      ],
      user
    )
    expect(withLines.lines.map((l) => l.productCode)).toEqual(['ORGE', 'MAÏS'])

    // Après la 2e pesée l'écart est calculé contre cette liste : la figer.
    await operations.capture({ operationId: ticket.id, weight: 5000, isManual: false }, user, 'p')
    await expect(
      operations.setLines(ticket.id, [{ productCode: 'AUTRE', quantityKg: 1 }], user)
    ).rejects.toThrow(/figé/i)
  })

  it('calcule le même net que le camion soit pesé chargé ou à vide en premier', async () => {
    const lines = [{ productCode: 'CIMENT', quantityKg: 5000 }]
    const heavyFirst = await operations.create({ type: 'ENTREE', lines }, user)
    await operations.capture(
      { operationId: heavyFirst.id, weight: 9000, isManual: false },
      user,
      'p'
    )
    const a = await operations.capture(
      { operationId: heavyFirst.id, weight: 4000, isManual: false },
      user,
      'p'
    )

    const lightFirst = await operations.create({ type: 'SORTIE' }, user)
    await operations.capture(
      { operationId: lightFirst.id, weight: 4000, isManual: false },
      user,
      'p'
    )
    const b = await operations.capture(
      { operationId: lightFirst.id, weight: 9000, isManual: false, lines },
      user,
      'p'
    )

    for (const done of [a, b]) {
      expect(done.grossWeight).toBe(9000)
      expect(done.tareWeight).toBe(4000)
      expect(done.netWeight).toBe(5000)
    }
  })

  it('le camion qui revient peser après chargement donne toujours haut moins bas', async () => {
    // Pesé une 1re fois CHARGÉ par oubli de la pesée à vide, puis revenu à vide.
    const ticket = await operations.create(
      { type: 'SORTIE', lines: [{ productCode: 'CIMENT', quantityKg: 5000 }] },
      user
    )
    await operations.capture({ operationId: ticket.id, weight: 9000, isManual: false }, user, 'p')
    const done = await operations.capture(
      {
        operationId: ticket.id,
        weight: 4000,
        isManual: false,
        lines: [{ productCode: 'CIMENT', quantityKg: 5000 }]
      },
      user,
      'p'
    )
    expect(done.netWeight).toBe(5000)
    expect(done.netWeight).toBeGreaterThanOrEqual(0)
  })

  it('refuse une 3e pesée sur un ticket qui en a déjà deux', async () => {
    const ticket = await operations.create(
      { type: 'ENTREE', lines: [{ productCode: 'CIMENT', quantityKg: 1000 }] },
      user
    )
    await operations.capture({ operationId: ticket.id, weight: 5000, isManual: false }, user, 'p')
    await operations.capture({ operationId: ticket.id, weight: 2000, isManual: false }, user, 'p')
    await expect(
      operations.capture({ operationId: ticket.id, weight: 3000, isManual: false }, user, 'p')
    ).rejects.toThrow(/déjà faites/)
  })

  it('annule un ticket avec un motif tracé', async () => {
    const ticket = await operations.create({ type: 'TIERS' }, user)
    await operations.cancel(ticket.id, 'Erreur de saisie', user)

    const reloaded = await operations.getById(ticket.id)
    expect(reloaded?.status).toBe('ANNULEE')
    expect(reloaded?.cancelReason).toBe('Erreur de saisie')

    // Un ticket annulé ne peut plus être pesé.
    await expect(
      operations.capture({ operationId: ticket.id, weight: 100, isManual: false }, user, 'p')
    ).rejects.toThrow(/déjà fermé ou annulé/i)
  })

  it('filtre et recherche dans la liste', async () => {
    const all = await operations.list({ limit: 100 })
    expect(all.length).toBeGreaterThan(0)

    const entrees = await operations.list({ type: 'ENTREE' })
    expect(entrees.every((row) => row.type === 'ENTREE')).toBe(true)

    const closed = await operations.list({ status: 'FERMEE' })
    expect(closed.every((row) => row.status === 'FERMEE')).toBe(true)

    const searched = await operations.list({ search: '12345-A-100' })
    expect(searched.some((row) => row.plate === '12345-A-100')).toBe(true)

    // La recherche porte aussi sur les codes produit, qui sont maintenant des lignes.
    const byProduct = await operations.list({ search: 'CIMENT' })
    expect(byProduct.some((row) => row.lines.some((l) => l.productCode === 'CIMENT'))).toBe(true)
  })

  it('fournit les emplacements semés par la migration', async () => {
    const locations = await operations.listLocations()
    expect(locations.map((l) => l.code)).toEqual(['EXTERNE', 'STOCK', 'UNITE_A', 'UNITE_B'])
    expect(locations.find((l) => l.code === 'STOCK')?.nameAr).toBe('المخزن المركزي')
  })

  it('lit et écrit le nom de la société imprimé sur le ticket', async () => {
    expect(await operations.getSetting('company_name')).toBe('Société')
    await operations.setSetting('company_name', 'Ciment du Sud')
    expect(await operations.getSetting('company_name')).toBe('Ciment du Sud')
  })

  it('garde la trace « manuelle » sur le ticket (1re et 2e pesée)', async () => {
    const ticket = await operations.create({ type: 'SORTIE' }, user)
    const afterFirst = await operations.capture(
      { operationId: ticket.id, weight: 4000, isManual: true, raw: 'MANUEL' },
      user,
      'p'
    )
    expect(afterFirst.first?.isManual).toBe(true)

    const done = await operations.capture(
      {
        operationId: ticket.id,
        weight: 9000,
        isManual: false,
        lines: [{ productCode: 'CIMENT', quantityKg: 5000 }]
      },
      user,
      'p'
    )
    expect(done.first?.isManual).toBe(true)
    expect(done.second?.isManual).toBe(false)
  })

  it("refait la 1re pesée : le ticket prend le nouveau poids, l'ancien reste tracé", async () => {
    const ticket = await operations.create({ type: 'SORTIE' }, user)
    await operations.capture({ operationId: ticket.id, weight: 4000, isManual: false }, user, 'p')

    const redone = await operations.redoFirst(
      { operationId: ticket.id, weight: 4150, isManual: true, raw: 'MANUEL' },
      user,
      'p'
    )
    expect(redone.first?.weight).toBe(4150)
    expect(redone.first?.isManual).toBe(true)
    expect(redone.second).toBeNull()
    expect(redone.status).toBe('OUVERTE')

    const [rows] = await pool
      .getPool()
      .query<RowDataPacket[]>(
        'SELECT weight, is_manual, superseded_at FROM weighings WHERE operation_id = ? ORDER BY id',
        [ticket.id]
      )
    expect(rows).toHaveLength(2)
    expect(Number(rows[0]?.weight)).toBe(4000)
    expect(rows[0]?.superseded_at).not.toBeNull() // remplacée, pas supprimée
    expect(Number(rows[1]?.weight)).toBe(4150)
    expect(rows[1]?.superseded_at).toBeNull()

    const [audit] = await pool
      .getPool()
      .query<RowDataPacket[]>(
        "SELECT before_json, after_json FROM audit_log WHERE action = 'REDO_FIRST' AND entity_id = ?",
        [String(ticket.id)]
      )
    expect(audit).toHaveLength(1)
    expect(asJson(audit[0]?.before_json).weight).toBe(4000)
    expect(asJson(audit[0]?.after_json).weight).toBe(4150)

    // la suite du ticket repart du nouveau poids
    const done = await operations.capture(
      {
        operationId: ticket.id,
        weight: 9150,
        isManual: false,
        lines: [{ productCode: 'CIMENT', quantityKg: 5000 }]
      },
      user,
      'p'
    )
    expect(done.tareWeight).toBe(4150)
    expect(done.netWeight).toBe(5000)
  })

  it('refuse de refaire la 1re pesée sans pesée, ou une fois la 2e faite', async () => {
    const empty = await operations.create({ type: 'SORTIE' }, user)
    await expect(
      operations.redoFirst({ operationId: empty.id, weight: 1, isManual: false }, user, 'p')
    ).rejects.toThrow(/Aucune 1re pesée/)

    await operations.capture({ operationId: empty.id, weight: 4000, isManual: false }, user, 'p')
    await operations.capture(
      {
        operationId: empty.id,
        weight: 9000,
        isManual: false,
        lines: [{ productCode: 'CIMENT', quantityKg: 5000 }]
      },
      user,
      'p'
    )
    await expect(
      operations.redoFirst({ operationId: empty.id, weight: 4100, isManual: false }, user, 'p')
    ).rejects.toThrow(/2e pesée est déjà faite/)
  })
  describe('lieux et retours', () => {
    const idOf = async (code: string): Promise<number> => {
      const [rows] = await pool
        .getPool()
        .query<RowDataPacket[]>('SELECT id FROM locations WHERE code = ?', [code])
      return Number(rows[0]?.id)
    }

    it("SORTIE : part du stock central vers l'extérieur, quels que soient les lieux envoyés", async () => {
      const central = await idOf('STOCK')
      const unitA = await idOf('UNITE_A')

      const ticket = await operations.create(
        { type: 'SORTIE', locationFromId: unitA, locationToId: unitA },
        user
      )
      expect(ticket.isRetour).toBe(false)
      expect(ticket.locationFromId).toBe(central)
      expect(ticket.locationToId).toBeNull()

      const updated = await operations.update(ticket.id, { locationToId: unitA }, user)
      expect(updated.locationFromId).toBe(central)
      expect(updated.locationToId).toBeNull()
    })

    it("ENTREE : l'arrivée choisie est gardée, à défaut le stock central ; jamais d'origine", async () => {
      const central = await idOf('STOCK')
      const unitB = await idOf('UNITE_B')

      const defaulted = await operations.create({ type: 'ENTREE' }, user)
      expect(defaulted.locationFromId).toBeNull()
      expect(defaulted.locationToId).toBe(central)

      const chosen = await operations.create({ type: 'ENTREE', locationToId: unitB }, user)
      expect(chosen.locationToId).toBe(unitB)

      const retouched = await operations.update(
        chosen.id,
        { locationFromId: unitB, locationToId: central },
        user
      )
      expect(retouched.locationFromId).toBeNull()
      expect(retouched.locationToId).toBe(central)
    })

    it('SORTIE en retour : sort du lieu choisi ; décocher le retour la ramène au stock central', async () => {
      const central = await idOf('STOCK')
      const unitA = await idOf('UNITE_A')

      const ticket = await operations.create({ type: 'SORTIE', isRetour: true }, user)
      expect(ticket.isRetour).toBe(true)
      expect(ticket.locationFromId).toBe(central)

      const fromUnit = await operations.update(ticket.id, { locationFromId: unitA }, user)
      expect(fromUnit.locationFromId).toBe(unitA)

      const normal = await operations.update(ticket.id, { isRetour: false }, user)
      expect(normal.isRetour).toBe(false)
      expect(normal.locationFromId).toBe(central)
    })

    it("TRANSFERT : les deux lieux restent ceux de l'opérateur", async () => {
      const unitA = await idOf('UNITE_A')
      const unitB = await idOf('UNITE_B')
      const ticket = await operations.create(
        { type: 'TRANSFERT', locationFromId: unitA, locationToId: unitB },
        user
      )
      expect(ticket.locationFromId).toBe(unitA)
      expect(ticket.locationToId).toBe(unitB)
    })

    it('un retour fermé bouge le stock dans le même sens qu’un ticket ordinaire', async () => {
      const unitA = await idOf('UNITE_A')
      const central = await idOf('STOCK')

      // retour client : la marchandise entre en unité A
      const back = await operations.create(
        {
          type: 'ENTREE',
          isRetour: true,
          locationToId: unitA,
          lines: [{ productCode: 'CMV RETOUR', quantityKg: 1000 }]
        },
        user
      )
      await operations.capture({ operationId: back.id, weight: 9000, isManual: false }, user, 'p')
      await operations.capture({ operationId: back.id, weight: 8000, isManual: false }, user, 'p')
      await operations.close(back.id, user)

      // retour fournisseur : la marchandise sort du stock central
      const away = await operations.create(
        {
          type: 'SORTIE',
          isRetour: true,
          lines: [{ productCode: 'CMV RETOUR', quantityKg: 500 }]
        },
        user
      )
      await operations.capture({ operationId: away.id, weight: 6000, isManual: false }, user, 'p')
      await operations.capture({ operationId: away.id, weight: 6500, isManual: false }, user, 'p')
      await operations.close(away.id, user)

      const [moves] = await pool.getPool().query<RowDataPacket[]>(
        `SELECT operation_id, location_id, qty_in, qty_out FROM v_stock_moves
          WHERE operation_id IN (?) ORDER BY operation_id`,
        [[back.id, away.id]]
      )
      expect(moves).toHaveLength(2)
      expect(moves[0]).toMatchObject({ location_id: unitA })
      expect(Number(moves[0]?.qty_in)).toBe(1000)
      expect(moves[1]).toMatchObject({ location_id: central })
      expect(Number(moves[1]?.qty_out)).toBe(500)
    })
  })
  it('filtre les tickets par date de création, jours inclus', async () => {
    const ticket = await operations.create({ type: 'TIERS', plate: 'DATE-FILTER-1' }, user)
    await pool
      .getPool()
      .query("UPDATE operations SET created_at = '2020-03-15 23:30:00' WHERE id = ?", [ticket.id])

    const ids = async (dateFrom?: string, dateTo?: string): Promise<number[]> =>
      (await operations.list({ search: 'DATE-FILTER-1', dateFrom, dateTo })).map((o) => o.id)

    expect(await ids()).toEqual([ticket.id])
    expect(await ids('2020-03-15', '2020-03-15')).toEqual([ticket.id]) // tard le dernier jour : inclus
    expect(await ids('2020-03-16')).toEqual([])
    expect(await ids(undefined, '2020-03-14')).toEqual([])
    expect(await ids('2020-03-01', '2020-03-31')).toEqual([ticket.id])
  })
  describe('liste paginée', () => {
    const make = async (plate: string, type: 'TIERS' | 'ENTREE' = 'TIERS'): Promise<number> =>
      (await operations.create({ type, plate }, user)).id

    it('découpe en pages sans doublon ni oubli, du plus récent au plus ancien', async () => {
      const made: number[] = []
      for (let i = 0; i < 7; i++) made.push(await make(`PGTEST-${i}`))

      const base = { type: 'TIERS' as const, search: 'PGTEST', pageSize: 3 }
      const p1 = await operations.page({ ...base, page: 1 })
      const p2 = await operations.page({ ...base, page: 2 })
      const p3 = await operations.page({ ...base, page: 3 })

      expect([p1.total, p1.pages, p1.pageSize]).toEqual([7, 3, 3])
      expect([p1.rows.length, p2.rows.length, p3.rows.length]).toEqual([3, 3, 1])

      const seen = [...p1.rows, ...p2.rows, ...p3.rows].map((o) => o.id)
      expect(new Set(seen).size).toBe(7) // aucun doublon
      expect([...seen].sort((a, b) => a - b)).toEqual([...made].sort((a, b) => a - b)) // aucun oubli
      expect(seen).toEqual([...seen].sort((a, b) => b - a)) // plus récent d'abord, même seconde
    })

    it('ramène une page trop lointaine à la dernière, et borne la taille de page', async () => {
      const far = await operations.page({
        type: 'TIERS',
        search: 'PGTEST',
        page: 99,
        pageSize: 3
      })
      expect(far.page).toBe(3)
      expect(far.rows).toHaveLength(1)

      const huge = await operations.page({ type: 'TIERS', search: 'PGTEST', pageSize: 100000 })
      expect(huge.pageSize).toBe(100)

      const none = await operations.page({ type: 'TIERS', search: 'AUCUN-TICKET-NE-CORRESPOND' })
      expect([none.total, none.pages, none.page, none.rows.length]).toEqual([0, 1, 1, 0])
    })

    it('trouve un matricule sans tenir compte de la casse, des espaces ni des tirets', async () => {
      const id = await make('12345-116-16')
      for (const term of ['12345 116 16', '1234511616', '12345-116-16', '116 16']) {
        const found = await operations.page({ type: 'TIERS', search: term })
        expect(found.rows.map((o) => o.id)).toContain(id)
      }
      const lower = await make('ab-123-cd')
      const found = await operations.page({ type: 'TIERS', search: 'AB123CD' })
      expect(found.rows.map((o) => o.id)).toContain(lower)
    })

    it('cherche « % » et « _ » tels quels, sans les traiter comme des jokers', async () => {
      const literal = await make('WILD%CARD')
      const other = await make('WILDXCARD')
      const found = await operations.page({ type: 'TIERS', search: 'WILD%CARD' })
      expect(found.rows.map((o) => o.id)).toEqual([literal])
      expect(found.rows.map((o) => o.id)).not.toContain(other)

      const underscore = await operations.page({ type: 'TIERS', search: 'WILD_CARD' })
      expect(underscore.rows).toHaveLength(0)
    })

    it('« en attente de la 2e pesée » : pesé une fois seulement', async () => {
      const waiting = await make('PGWAIT-1', 'ENTREE')
      const fresh = await make('PGWAIT-2', 'ENTREE') // aucune pesée
      const done = await make('PGWAIT-3', 'ENTREE')

      await operations.capture({ operationId: waiting, weight: 9000, isManual: false }, user, 'p')
      await operations.capture({ operationId: done, weight: 9000, isManual: false }, user, 'p')
      await operations.capture(
        {
          operationId: done,
          weight: 4000,
          isManual: false,
          lines: [{ productCode: 'CIMENT', quantityKg: 5000 }]
        },
        user,
        'p'
      )

      const list = await operations.page({
        type: 'ENTREE',
        status: 'OUVERTE',
        awaitingSecond: true,
        search: 'PGWAIT'
      })
      expect(list.rows.map((o) => o.id)).toEqual([waiting])
      expect(list.total).toBe(1)
      expect(list.rows.map((o) => o.id)).not.toContain(fresh)
      expect(list.rows.map((o) => o.id)).not.toContain(done)
    })

    it('combine recherche, période et page sur le même total', async () => {
      const id = await make('PGDATE-1')
      await pool
        .getPool()
        .query("UPDATE operations SET created_at = '2019-06-15 23:59:59' WHERE id = ?", [id])

      const inRange = await operations.page({
        type: 'TIERS',
        search: 'PGDATE',
        dateFrom: '2019-06-15',
        dateTo: '2019-06-15'
      })
      expect(inRange.total).toBe(1)
      const outside = await operations.page({
        type: 'TIERS',
        search: 'PGDATE',
        dateFrom: '2019-06-16'
      })
      expect(outside.total).toBe(0)
    })
  })

  describe('vrac : sortie pesée avant le BL', () => {
    const weighTwice = async (id: number, first: number, second: number, extra = {}) => {
      await operations.capture({ operationId: id, weight: first, isManual: false }, user, 'p')
      return operations.capture(
        { operationId: id, weight: second, isManual: false, ...extra },
        user,
        'p'
      )
    }

    it('le poids net devient la quantité : ni poids supposé ni écart', async () => {
      const ticket = await operations.create({ type: 'SORTIE', isVrac: true }, user)
      expect(ticket.isVrac).toBe(true)

      // Camion pesé à vide, chargé, puis revenu : net = 34 150 - 8 400.
      const done = await weighTwice(ticket.id, 8400, 34150, { vracProduct: 'Maïs vrac' })

      expect(done.netWeight).toBe(25750)
      expect(done.lines).toEqual([{ productId: null, productCode: 'Maïs vrac', quantityKg: 25750 }])
      expect(done.weightSupposed).toBeNull()
      expect(done.ecart).toBeNull()
      expect(done.ecartOk).toBeNull()
    })

    it('fonctionne quand le camion arrive chargé et repasse à vide', async () => {
      const ticket = await operations.create({ type: 'SORTIE', isVrac: true }, user)
      const done = await weighTwice(ticket.id, 34150, 8400, { vracProduct: 'Son' })
      expect(done.netWeight).toBe(25750)
    })

    it('refuse la 2e pesée sans produit, et ne garde aucune trace de la pesée refusée', async () => {
      const ticket = await operations.create({ type: 'SORTIE', isVrac: true }, user)
      await operations.capture({ operationId: ticket.id, weight: 8400, isManual: false }, user, 'p')

      await expect(
        operations.capture({ operationId: ticket.id, weight: 34150, isManual: false }, user, 'p')
      ).rejects.toThrow(/produit/i)

      const after = await operations.getById(ticket.id)
      expect(after?.second).toBeNull()
      expect(after?.lines).toEqual([])
    })

    it('refuse un net nul : aucune quantité à facturer', async () => {
      const ticket = await operations.create({ type: 'SORTIE', isVrac: true }, user)
      await operations.capture({ operationId: ticket.id, weight: 8400, isManual: false }, user, 'p')

      await expect(
        operations.capture(
          { operationId: ticket.id, weight: 8400, isManual: false, vracProduct: 'Maïs' },
          user,
          'p'
        )
      ).rejects.toThrow(/net est nul/i)
    })

    it('ignore des lignes envoyées par erreur sur un ticket vrac', async () => {
      const ticket = await operations.create({ type: 'SORTIE', isVrac: true }, user)
      const done = await weighTwice(ticket.id, 8400, 10400, {
        vracProduct: 'Maïs',
        lines: [{ productCode: 'AUTRE', quantityKg: 99 }]
      })
      expect(done.lines).toEqual([{ productId: null, productCode: 'Maïs', quantityKg: 2000 }])
    })

    it('le vrac fermé fait sortir du stock le poids net', async () => {
      const ticket = await operations.create({ type: 'SORTIE', isVrac: true }, user)
      await weighTwice(ticket.id, 8400, 34150, { vracProduct: 'Maïs vrac' })
      await operations.close(ticket.id, user)

      const [moves] = await pool
        .getPool()
        .query<RowDataPacket[]>(
          'SELECT product_code, qty_out FROM v_stock_moves WHERE operation_id = ? AND qty_out > 0',
          [ticket.id]
        )
      expect(moves).toHaveLength(1)
      expect(moves[0]?.product_code).toBe('Maïs vrac')
      expect(Number(moves[0]?.qty_out)).toBe(25750)
    })

    it("n'existe que pour une sortie ordinaire", async () => {
      await expect(operations.create({ type: 'ENTREE', isVrac: true }, user)).rejects.toThrow(
        /uniquement les sorties/i
      )
      await expect(
        operations.create({ type: 'SORTIE', isVrac: true, isRetour: true }, user)
      ).rejects.toThrow(/uniquement les sorties/i)

      const vrac = await operations.create({ type: 'SORTIE', isVrac: true }, user)
      await expect(operations.update(vrac.id, { isRetour: true }, user)).rejects.toThrow(
        /uniquement les sorties/i
      )
    })

    it('ne bascule plus en vrac (ou hors vrac) une fois la 2e pesée faite', async () => {
      const ordinary = await operations.create(
        { type: 'SORTIE', lines: [{ productCode: 'CMV', quantityKg: 1000 }] },
        user
      )
      await weighTwice(ordinary.id, 5000, 6000)
      await expect(operations.update(ordinary.id, { isVrac: true }, user)).rejects.toThrow(
        /après la 2e pesée/i
      )

      const vrac = await operations.create({ type: 'SORTIE', isVrac: true }, user)
      await weighTwice(vrac.id, 5000, 6000, { vracProduct: 'Maïs' })
      await expect(operations.update(vrac.id, { isVrac: false }, user)).rejects.toThrow(
        /après la 2e pesée/i
      )
      // Renvoyer la même valeur (l'écran de correction envoie tous les champs) reste permis.
      const same = await operations.update(vrac.id, { isVrac: true, notes: 'ok' }, user)
      expect(same.isVrac).toBe(true)
    })

    it('liste « BL à établir » : vrac pesé, non annulé, sans BL', async () => {
      const pending = await operations.create({ type: 'SORTIE', isVrac: true }, user)
      await weighTwice(pending.id, 8400, 20400, { vracProduct: 'Orge' })

      const linked = await operations.create({ type: 'SORTIE', isVrac: true }, user)
      await weighTwice(linked.id, 8400, 20400, { vracProduct: 'Orge' })
      await operations.update(linked.id, { blNo: 'BL26-05255', blDate: '2026-10-21' }, user)

      const notWeighedTwice = await operations.create({ type: 'SORTIE', isVrac: true }, user)
      await operations.capture(
        { operationId: notWeighedTwice.id, weight: 8400, isManual: false },
        user,
        'p'
      )

      const cancelled = await operations.create({ type: 'SORTIE', isVrac: true }, user)
      await weighTwice(cancelled.id, 8400, 20400, { vracProduct: 'Orge' })
      await operations.cancel(cancelled.id, 'erreur de saisie', user)

      const ordinary = await operations.create({ type: 'SORTIE' }, user)

      const found = await operations.list({ type: 'SORTIE', blPending: true, limit: 500 })
      const ids = found.map((op) => op.id)
      expect(ids).toContain(pending.id)
      expect(ids).not.toContain(linked.id)
      expect(ids).not.toContain(notWeighedTwice.id)
      expect(ids).not.toContain(cancelled.id)
      expect(ids).not.toContain(ordinary.id)

      // La page serveur applique le même filtre.
      const page = await operations.page({ type: 'SORTIE', blPending: true, pageSize: 100 })
      expect(page.rows.map((op) => op.id)).toContain(pending.id)
      expect(page.rows.every((op) => op.isVrac)).toBe(true)
    })
  })

  describe('enlèvement vrac : plusieurs rotations, un seul BL', () => {
    /** Une rotation complète : création (dans l'enlèvement), 1re puis 2e pesée. */
    const rotate = async (
      groupId: number | null,
      first: number,
      second: number,
      product = 'Maïs vrac',
      plate = '12345-116-16'
    ) => {
      const ticket = await operations.create(
        { type: 'SORTIE', isVrac: true, vracGroupId: groupId, plate },
        user
      )
      await operations.capture({ operationId: ticket.id, weight: first, isManual: false }, user, 'p')
      return operations.capture(
        { operationId: ticket.id, weight: second, isManual: false, vracProduct: product },
        user,
        'p'
      )
    }

    it('somme 4 rotations en un seul total, dans un seul enlèvement', async () => {
      const first = await rotate(null, 8400, 34150)
      const groupId = first.vracGroupId as number
      expect(groupId).toBeGreaterThan(0)

      await rotate(groupId, 8400, 34500)
      await rotate(groupId, 8450, 34350)
      const last = await rotate(groupId, 8400, 34650)
      expect(last.vracGroupId).toBe(groupId)

      const group = await vracGroups.getGroup(groupId)
      expect(group?.rotations).toHaveLength(4)
      expect(group?.weighedCount).toBe(4)
      expect(group?.awaitingCount).toBe(0)
      // 25 750 + 26 100 + 25 900 + 26 250
      expect(group?.totalNetKg).toBe(104000)
      expect(group?.products).toEqual([{ productCode: 'Maïs vrac', quantityKg: 104000 }])
      expect(group?.reference).toBe(first.ticketNo)
      expect(group?.status).toBe('OUVERT')
    })

    it('chaque ticket vrac a son enlèvement, même seul', async () => {
      const a = await rotate(null, 8400, 20400)
      const b = await rotate(null, 8400, 20400)
      expect(a.vracGroupId).not.toBeNull()
      expect(a.vracGroupId).not.toBe(b.vracGroupId)
    })

    it('refuse de rejoindre un enlèvement inconnu ou clos', async () => {
      await expect(
        operations.create({ type: 'SORTIE', isVrac: true, vracGroupId: 999999 }, user)
      ).rejects.toThrow(/introuvable/i)

      const first = await rotate(null, 8400, 20400)
      const groupId = first.vracGroupId as number
      await vracGroups.closeGroup(groupId, user)
      await expect(
        operations.create({ type: 'SORTIE', isVrac: true, vracGroupId: groupId }, user)
      ).rejects.toThrow(/clôturé/i)
    })

    it('ne clôture pas tant qu\'un camion attend sa 2e pesée', async () => {
      const first = await rotate(null, 8400, 20400)
      const groupId = first.vracGroupId as number

      const pending = await operations.create(
        { type: 'SORTIE', isVrac: true, vracGroupId: groupId },
        user
      )
      await operations.capture({ operationId: pending.id, weight: 8400, isManual: false }, user, 'p')

      await expect(vracGroups.closeGroup(groupId, user)).rejects.toThrow(/2e pesée/i)

      // Une fois la rotation annulée, la clôture devient possible et le total reste juste.
      await operations.cancel(pending.id, 'camion reparti vide', user)
      const closed = await vracGroups.closeGroup(groupId, user)
      expect(closed.status).toBe('CLOS')
      expect(closed.totalNetKg).toBe(12000)
      expect(closed.closedAt).not.toBeNull()
    })

    it('ne clôture pas un enlèvement sans rotation pesée, ni deux fois', async () => {
      const empty = await operations.create({ type: 'SORTIE', isVrac: true }, user)
      await expect(vracGroups.closeGroup(empty.vracGroupId as number, user)).rejects.toThrow(
        /rien à clôturer/i
      )

      const done = await rotate(null, 8400, 20400)
      await vracGroups.closeGroup(done.vracGroupId as number, user)
      await expect(vracGroups.closeGroup(done.vracGroupId as number, user)).rejects.toThrow(
        /déjà clôturé/i
      )
    })

    it('une rotation annulée ne compte pas dans le total', async () => {
      const first = await rotate(null, 8400, 20400)
      const groupId = first.vracGroupId as number
      const second = await rotate(groupId, 8400, 30400)
      await operations.cancel(second.id, 'erreur de pesée', user)

      expect((await vracGroups.getGroup(groupId))?.totalNetKg).toBe(12000)
    })

    it('le BL du commercial est rattaché à toutes les rotations', async () => {
      const first = await rotate(null, 8400, 34150)
      const groupId = first.vracGroupId as number
      const second = await rotate(groupId, 8400, 34500)
      await vracGroups.closeGroup(groupId, user)

      const linked = await vracGroups.linkBl(
        { id: groupId, blNo: 'BL26-05255', blDate: '2026-10-22', partnerName: 'HANGAR AIN NOUISSY' },
        user
      )

      expect(linked.blNo).toBe('BL26-05255')
      expect(linked.partnerName).toBe('HANGAR AIN NOUISSY')
      for (const rotation of linked.rotations) {
        expect(rotation.blNo).toBe('BL26-05255')
        expect(rotation.blDate).toBe('2026-10-22')
      }
      expect((await operations.getById(second.id))?.blNo).toBe('BL26-05255')

      // Plus rien à établir : ni dans la liste des tickets, ni dans celle des enlèvements.
      const pendingTickets = (await operations.list({ type: 'SORTIE', blPending: true, limit: 500 })).map((o) => o.id)
      expect(pendingTickets).not.toContain(first.id)
      const pendingGroups = (await vracGroups.listGroups({ blPending: true })).map((g) => g.id)
      expect(pendingGroups).not.toContain(groupId)
    })

    it('ne remplace pas un client déjà saisi', async () => {
      const first = await rotate(null, 8400, 20400)
      await operations.update(first.id, { partnerName: 'Client saisi à la balance' }, user)
      const linked = await vracGroups.linkBl(
        { id: first.vracGroupId as number, blNo: 'BL26-00001', partnerName: 'Nom du BL' },
        user
      )
      expect(linked.partnerName).toBe('Client saisi à la balance')
    })

    it('refuse un BL sur un enlèvement sans rotation pesée', async () => {
      const empty = await operations.create({ type: 'SORTIE', isVrac: true }, user)
      await expect(
        vracGroups.linkBl({ id: empty.vracGroupId as number, blNo: 'BL26-00002' }, user)
      ).rejects.toThrow(/Aucune rotation pesée/i)
    })

    it("saisir le BL sur un ticket l'étend aux autres rotations de l'enlèvement", async () => {
      const first = await rotate(null, 8400, 20400)
      const second = await rotate(first.vracGroupId as number, 8400, 20400)

      await operations.update(second.id, { blNo: 'BL26-00003', blDate: '2026-10-22' }, user)

      expect((await operations.getById(first.id))?.blNo).toBe('BL26-00003')
      expect((await operations.getById(first.id))?.blDate).toBe('2026-10-22')
    })

    it('rouvre un enlèvement clos par erreur, sauf si un BL est déjà renseigné', async () => {
      const first = await rotate(null, 8400, 20400)
      const groupId = first.vracGroupId as number
      await vracGroups.closeGroup(groupId, user)

      const reopened = await vracGroups.reopenGroup(groupId, user)
      expect(reopened.status).toBe('OUVERT')
      expect(reopened.closedAt).toBeNull()
      // Il accepte de nouveau une rotation.
      const more = await rotate(groupId, 8400, 20400)
      expect(more.vracGroupId).toBe(groupId)

      await vracGroups.closeGroup(groupId, user)
      await vracGroups.linkBl({ id: groupId, blNo: 'BL26-00004' }, user)
      await expect(vracGroups.reopenGroup(groupId, user)).rejects.toThrow(/BL est déjà renseigné/i)
    })

    it('un ticket basculé en vrac reçoit un enlèvement ; sorti du vrac, il le quitte', async () => {
      const ticket = await operations.create({ type: 'SORTIE' }, user)
      expect(ticket.vracGroupId).toBeNull()

      const asVrac = await operations.update(ticket.id, { isVrac: true }, user)
      const groupId = asVrac.vracGroupId as number
      expect(groupId).toBeGreaterThan(0)

      const back = await operations.update(ticket.id, { isVrac: false }, user)
      expect(back.vracGroupId).toBeNull()
      // L'enlèvement resté vide disparaît.
      expect(await vracGroups.getGroup(groupId)).toBeNull()
    })

    it('liste les enlèvements par statut et par recherche', async () => {
      const open = await rotate(null, 8400, 20400, 'Maïs', 'ZZ-OPEN-1')
      const closed = await rotate(null, 8400, 20400, 'Maïs', 'ZZ-CLOSED-1')
      await vracGroups.closeGroup(closed.vracGroupId as number, user)

      const opened = (await vracGroups.listGroups({ status: 'OUVERT' })).map((g) => g.id)
      expect(opened).toContain(open.vracGroupId)
      expect(opened).not.toContain(closed.vracGroupId)

      const found = await vracGroups.listGroups({ search: 'ZZ-CLOSED' })
      expect(found.map((g) => g.id)).toEqual([closed.vracGroupId])
    })

    it('le stock sort la somme des rotations enregistrées', async () => {
      const first = await rotate(null, 8400, 34150, 'Maïs stock')
      const second = await rotate(first.vracGroupId as number, 8400, 34500, 'Maïs stock')
      await operations.close(first.id, user)
      await operations.close(second.id, user)

      const [moves] = await pool
        .getPool()
        .query<RowDataPacket[]>(
          'SELECT SUM(qty_out) AS total FROM v_stock_moves WHERE operation_id IN (?, ?) AND qty_out > 0',
          [first.id, second.id]
        )
      expect(Number(moves[0]?.total)).toBe(51850)
    })
  })
})

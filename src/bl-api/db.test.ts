import { describe, expect, it } from 'vitest'
import {
  createDb,
  DatabaseUnavailableError,
  isConnectionError,
  type OdbcConnection,
  type OdbcModule,
  type Row
} from './db'

const config = { connectionString: 'DSN=test', connectTimeoutMs: 50, queryTimeoutMs: 50 }

function odbcError(message: string, state?: string): Error {
  return Object.assign(new Error(message), state ? { odbcErrors: [{ state }] } : {})
}

function fakeOdbc(
  makeConnection: (index: number) => Partial<OdbcConnection>,
  failConnect: (index: number) => Error | null = () => null
) {
  let connects = 0
  const closed: number[] = []
  const odbc: OdbcModule = {
    async connect() {
      const index = connects++
      const failure = failConnect(index)
      if (failure) throw failure
      const base = makeConnection(index)
      return {
        query: async () => [],
        columns: async () => [],
        ...base,
        close: async () => {
          closed.push(index)
        }
      }
    }
  }
  return { odbc, connects: () => connects, closed }
}

describe('isConnectionError', () => {
  it('reconnaît le SQLSTATE de classe 08, quelle que soit la langue', () => {
    expect(isConnectionError(odbcError('x', '08S01'))).toBe(true)
    expect(isConnectionError(odbcError('x', '42000'))).toBe(false)
  })

  it('reconnaît les messages français du pilote', () => {
    expect(isConnectionError(new Error('Connexion perdue avec le serveur'))).toBe(true)
    expect(isConnectionError(new Error('Syntax error near FROM'))).toBe(false)
  })
})

describe('createDb', () => {
  it("n'ouvre la connexion qu'à la première requête", async () => {
    const fake = fakeOdbc(() => ({ query: async () => [{ n: 1 }] as Row[] }))
    const db = createDb(config, async () => fake.odbc)

    expect(fake.connects()).toBe(0)
    expect(await db.query('SELECT 1')).toEqual([{ n: 1 }])
    await db.query('SELECT 2')
    expect(fake.connects()).toBe(1)
  })

  it('exécute les requêtes une par une', async () => {
    let active = 0
    let maxActive = 0
    const fake = fakeOdbc(() => ({
      query: async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        return []
      }
    }))
    const db = createDb(config, async () => fake.odbc)

    await Promise.all([db.query('a'), db.query('b'), db.query('c')])
    expect(maxActive).toBe(1)
  })

  it('rouvre une connexion coupée et rejoue la requête', async () => {
    const fake = fakeOdbc((index) => ({
      query: async () => {
        if (index === 0) throw odbcError('Communication link failure', '08S01')
        return [{ ok: true }] as Row[]
      }
    }))
    const db = createDb(config, async () => fake.odbc)

    expect(await db.query('SELECT 1')).toEqual([{ ok: true }])
    expect(fake.connects()).toBe(2)
    expect(fake.closed).toEqual([0])
  })

  it("déclare la base injoignable si la connexion reste coupée", async () => {
    const fake = fakeOdbc(() => ({
      query: async () => {
        throw odbcError('Connexion perdue', '08S01')
      }
    }))
    const db = createDb(config, async () => fake.odbc)

    await expect(db.query('SELECT 1')).rejects.toBeInstanceOf(DatabaseUnavailableError)
  })

  it('laisse passer une erreur SQL sans rouvrir la connexion', async () => {
    const fake = fakeOdbc(() => ({
      query: async () => {
        throw odbcError('Syntax error', '42000')
      }
    }))
    const db = createDb(config, async () => fake.odbc)

    await expect(db.query('SELEC')).rejects.toThrow('Syntax error')
    expect(fake.connects()).toBe(1)
    expect(fake.closed).toEqual([])
  })

  it('déclare la base injoignable puis se rétablit quand elle revient', async () => {
    const fake = fakeOdbc(
      () => ({ query: async () => [{ n: 1 }] as Row[] }),
      (index) => (index === 0 ? odbcError('Impossible de se connecter', '08001') : null)
    )
    const db = createDb(config, async () => fake.odbc)

    await expect(db.query('SELECT 1')).rejects.toBeInstanceOf(DatabaseUnavailableError)
    expect(await db.query('SELECT 1')).toEqual([{ n: 1 }])
  })

  it('ne reste pas bloqué sur une connexion qui ne répond pas', async () => {
    const odbc: OdbcModule = { connect: () => new Promise(() => undefined) }
    const db = createDb(config, async () => odbc)

    await expect(db.query('SELECT 1')).rejects.toThrow(/délai/)
  })

  it('jette une connexion dont la requête dépasse le délai et en rouvre une', async () => {
    const fake = fakeOdbc((index) => ({
      query: () => (index === 0 ? new Promise<Row[]>(() => undefined) : Promise.resolve([{ ok: 1 }]))
    }))
    const db = createDb(config, async () => fake.odbc)

    await expect(db.query('lent')).rejects.toBeInstanceOf(DatabaseUnavailableError)
    expect(await db.query('rapide')).toEqual([{ ok: 1 }])
    expect(fake.connects()).toBe(2)
  })
})

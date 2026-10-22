import { describe, expect, it } from 'vitest'
import { toSettingsView } from './settings-view'

describe('toSettingsView', () => {
  it('never returns the saved database password to the renderer', () => {
    const view = toSettingsView({
      db: {
        host: 'db.internal',
        port: 3306,
        user: 'balance',
        password: 'secret-value',
        database: 'balance'
      },
      balance: null,
      blApiUrl: null
    })

    expect(view.db).toEqual({
      host: 'db.internal',
      port: 3306,
      user: 'balance',
      database: 'balance',
      hasPassword: true
    })
    expect(view.db).not.toHaveProperty('password')
  })

  it('reports when no password is stored', () => {
    const view = toSettingsView({
      db: { host: 'localhost', port: 3306, user: 'root', password: '', database: 'balance' },
      balance: null,
      blApiUrl: null
    })

    expect(view.db?.hasPassword).toBe(false)
  })
})

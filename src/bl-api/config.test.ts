import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

describe('loadConfig', () => {
  it('binds the unauthenticated service to loopback by default', () => {
    expect(loadConfig({ HFSQL_CONN: 'DSN=test' }).host).toBe('127.0.0.1')
  })

  it('allows an explicit host for a deliberately shared service', () => {
    expect(loadConfig({ HFSQL_CONN: 'DSN=test', HOST: '0.0.0.0' }).host).toBe('0.0.0.0')
  })
})

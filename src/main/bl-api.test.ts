import { afterEach, describe, expect, it, vi } from 'vitest'
import { blApiBaseUrl, isLocalBlApiUrl, lookupBl } from './bl-api'

const payload = {
  found: true,
  bl: {
    id: 39394,
    reference: 'BL26-05255',
    date: '2026-07-01',
    client: { code: '78', name: 'HANGAR AIN NOUISSY' },
    totalWeightKg: 12.5,
    knownWeightKg: 12.5,
    weightComplete: true,
    unknownWeightLines: 0
  },
  lines: [
    {
      code: 'VIG 1L',
      name: 'Vigosine 1L',
      quantity: 2,
      weightKg: 2,
      weightSource: 'line'
    },
    {
      code: 'INT A+',
      name: 'Introvit A+',
      quantity: 6,
      weightKg: 10.5,
      weightSource: 'article'
    }
  ]
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('local API detection', () => {
  it('normalizes the API base URL', () => {
    expect(blApiBaseUrl('http://127.0.0.1:3100/')).toBe('http://127.0.0.1:3100')
  })

  it('recognizes the default local service', () => {
    expect(isLocalBlApiUrl('http://127.0.0.1:3100')).toBe(true)
    expect(isLocalBlApiUrl('http://localhost:3100')).toBe(true)
    expect(isLocalBlApiUrl('http://[::1]:3100')).toBe(true)
  })

  it('does not try to start a remote or prefixed service', () => {
    expect(isLocalBlApiUrl('http://192.168.0.120:3000')).toBe(false)
    expect(isLocalBlApiUrl('https://localhost:3000')).toBe(false)
    expect(isLocalBlApiUrl('http://localhost:3100/bl-api')).toBe(false)
  })
})

describe('lookupBl', () => {
  it('calls the API and maps the BL for the weighing screen', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(payload))
    vi.stubGlobal('fetch', fetchMock)

    const result = await lookupBl('BL26-05255', 'http://localhost:3100/')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3100/api/bl/BL26-05255',
      expect.objectContaining({ headers: { accept: 'application/json' } })
    )
    expect(result.reference).toBe('BL26-05255')
    expect(result.clientName).toBe('HANGAR AIN NOUISSY')
    expect(result.totalWeightKg).toBe(12.5)
    expect(result.weightComplete).toBe(true)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[1].weightSource).toBe('article')
  })

  it('renders the API message when the BL does not exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ found: false, error: 'not_found', message: 'Aucun BL trouvé.' }, 404)
      )
    )

    await expect(lookupBl('5255', 'http://localhost:3100')).rejects.toThrow('Aucun BL trouvé.')
  })

  it('adds the candidates when the number is ambiguous', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            found: false,
            error: 'ambiguous_number',
            message: 'Précisez l’année.',
            candidates: [{ reference: 'BL26-05255' }, { reference: 'BL25-05255' }]
          },
          409
        )
      )
    )

    await expect(lookupBl('5255', 'http://localhost:3100')).rejects.toThrow(
      'Précisez l’année. BL26-05255, BL25-05255'
    )
  })

  it('rejects a payload that does not match the API contract', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ found: true })))

    await expect(lookupBl('BL26-05255', 'http://localhost:3100')).rejects.toThrow(
      'Réponse inattendue'
    )
  })

  it('reports an unreachable service without leaking the URL credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      })
    )

    await expect(lookupBl('BL26-05255', 'http://localhost:3999')).rejects.toThrow(
      'API BL injoignable (http://localhost:3999)'
    )
  })
})

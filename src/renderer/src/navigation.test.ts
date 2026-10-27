import { describe, expect, it } from 'vitest'
import type { OperationType } from '@shared/types'
import { operationPath } from './navigation'

describe('operationPath', () => {
  it.each([
    ['ENTREE', '/entrees'],
    ['SORTIE', '/sorties'],
    ['TRANSFERT', '/transferts'],
    ['TIERS', '/tiers']
  ] as const satisfies readonly (readonly [OperationType, string])[])(
    'routes %s to its operation screens',
    (type, path) => {
      expect(operationPath(type)).toBe(path)
    }
  )
})

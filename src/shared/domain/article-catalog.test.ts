import { describe, expect, it } from 'vitest'
import { articleGroupForOperation, searchArticleCatalog } from './article-catalog'
import type { ArticleOption } from '../types'

const articles: ArticleOption[] = [
  { id: 1, code: 'MV', name: 'Mais Vrac' },
  { id: 2, code: 'SV', name: 'Soja Vrac' },
  { id: 3, code: 'CL', name: 'Calcaire' },
  { id: 4, code: 'S/F', name: 'Son Fin' },
  { id: 5, code: 'CMV OB', name: 'CMV Ovin Bovin 4100' },
  { id: 6, code: 'AL MAIS', name: 'Mais Broyé' },
  { id: 7, code: 'AL DEMARRAGE', name: 'Aliment Chair Demarrage Miete Sac' },
  { id: 8, code: 'AL REPRO N1', name: 'Aliment Repro N°1 SAC' },
  { id: 9, code: 'AL REPRO CAILLE', name: 'Aliment Repro Caille' },
  { id: 10, code: 'AL REPRO 1 CASPM TYL', name: 'Aliment Repro 01 CASPM avec tylon' },
  { id: 11, code: 'INTROVIT A+', name: 'Introvit A+' },
  { id: 12, code: 'TRAN MV', name: 'Transport Mais' }
]

describe('article catalog', () => {
  it('limits entries to the selected raw materials and database-backed CMV items', () => {
    expect(
      searchArticleCatalog(articles, '', articleGroupForOperation('ENTREE', false)).map(
        (article) => article.id
      )
    ).toEqual([3, 5, 1, 2, 4])
  })

  it('keeps returns in the same entry product list', () => {
    expect(articleGroupForOperation('ENTREE', true)).toBe('raw')
    expect(
      searchArticleCatalog(articles, '', articleGroupForOperation('ENTREE', true)).map(
        (article) => article.id
      )
    ).toEqual([3, 5, 1, 2, 4])
  })

  it('limits sorties to HFSQL articles represented in the supplied finished-products database', () => {
    expect(
      searchArticleCatalog(articles, '', articleGroupForOperation('SORTIE', false)).map(
        (article) => article.id
      )
    ).toEqual([7, 8])
  })

  it('leaves the transfer catalog unchanged', () => {
    expect(
      searchArticleCatalog(articles, '', articleGroupForOperation('TRANSFERT', false)).map(
        (article) => article.id
      )
    ).toEqual([7, 10, 9, 8, 3, 5, 11, 6, 1, 2, 4, 12])
  })
})

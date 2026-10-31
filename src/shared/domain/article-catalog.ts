import type { ArticleCatalogGroup, ArticleOption, OperationType } from '../types'

const RAW_PRODUCT_TERMS = ['mais', 'soja', 'son fin', 'calcaire']
const ANIMAL_NUTRITION_TERMS = [
  'aliment',
  'cmv',
  'nutrition animale',
  'animal nutrition',
  'feed',
  'zyme',
  'klinofood'
]
const VETERINARY_PRODUCT_TERMS = [
  'veterinaire',
  'veterinary',
  'vet',
  'veto',
  'medicament',
  'vaccin',
  'vaccination',
  'antibiotique',
  'tyl',
  'tylon',
  'tylan',
  'antiparasitaire',
  'parasiticide',
  'vermifuge',
  'pharmacie'
]
export const ARTICLE_CATALOG_GROUPS = ['raw', 'nutrition', 'all'] as const

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function isArticleCatalogGroup(value: unknown): value is ArticleCatalogGroup {
  return typeof value === 'string' && ARTICLE_CATALOG_GROUPS.includes(value as ArticleCatalogGroup)
}

/** Entries use raw materials unless they are a return; sorties use animal nutrition. */
export function articleGroupForOperation(
  type: OperationType,
  isRetour: boolean
): ArticleCatalogGroup {
  if (type === 'ENTREE') return isRetour ? 'nutrition' : 'raw'
  if (type === 'SORTIE') return 'nutrition'
  return 'all'
}

function isRawProduct(article: ArticleOption): boolean {
  const code = normalize(article.code ?? '')
  const name = normalize(article.name ?? '')
  if (code.startsWith('tran ') || name.startsWith('transport ')) return false
  if (name.startsWith('aliment ')) return false
  if (code === 'cmv' || code.startsWith('cmv ') || name === 'cmv' || name.startsWith('cmv ')) {
    return true
  }
  const text = `${code} ${name}`
  return RAW_PRODUCT_TERMS.some((term) => ` ${text} `.includes(` ${normalize(term)} `))
}

function isAnimalNutritionProduct(article: ArticleOption): boolean {
  const text = normalize(`${article.code ?? ''} ${article.name ?? ''}`)
  return ANIMAL_NUTRITION_TERMS.some((term) => ` ${text} `.includes(` ${normalize(term)} `))
}

function isVeterinaryProduct(article: ArticleOption): boolean {
  const text = normalize(`${article.code ?? ''} ${article.name ?? ''}`)
  return VETERINARY_PRODUCT_TERMS.some((term) => ` ${text} `.includes(` ${normalize(term)} `))
}

/** Filter and rank cached HFSQL articles for the operator's searchable picker. */
export function searchArticleCatalog(
  articles: ArticleOption[],
  query: string,
  group: ArticleCatalogGroup,
  limit = 50
): ArticleOption[] {
  const needle = normalize(query)
  return articles
    .filter((article) => {
      if (!article.code && !article.name) return false
      if (group === 'raw' && !isRawProduct(article)) return false
      if (
        group === 'nutrition' &&
        (!isAnimalNutritionProduct(article) || isVeterinaryProduct(article))
      ) {
        return false
      }
      if (!needle) return true
      return normalize(`${article.code ?? ''} ${article.name ?? ''}`).includes(needle)
    })
    .sort((left, right) =>
      (left.name ?? left.code ?? '').localeCompare(right.name ?? right.code ?? '', 'fr')
    )
    .slice(0, limit)
}

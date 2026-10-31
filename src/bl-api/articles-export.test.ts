import { describe, expect, it } from 'vitest'
import { combineArticleRows, formatArticlesCsv, summarizeArticleFacets } from './articles-export'

function utf16Buffer(value: string): ArrayBuffer {
  const bytes = new Uint8Array(value.length * 2)
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    bytes[index * 2] = code & 0xff
    bytes[index * 2 + 1] = code >> 8
  }
  return bytes.buffer
}

function windows1252Buffer(value: string): ArrayBuffer {
  return Uint8Array.from(Array.from(value, (character) => character.charCodeAt(0))).buffer
}

describe('export des articles HFSQL', () => {
  it('conserve tous les articles et ajoute le nombre de lignes BL vendues', () => {
    const rows = combineArticleRows(
      [
        {
          IDArticle: 7,
          Reference: '3/5',
          Libelle: 'Aliment, croissance "N1"',
          Famille: 'Nutrition',
          Sous_Famille: 'Volaille',
          Classification: 2,
          Categorie: 'Finis',
          Unite_Mesure: 'Q',
          Poids_Brut: 25
        },
        {
          IDArticle: 8,
          Reference: 'V-2',
          Libelle: 'Vaccin',
          Famille: 'Veterinaire',
          Sous_Famille: null,
          Classification: 9,
          Categorie: 'Sante',
          Unite_Mesure: 'U',
          Poids_Brut: null
        }
      ],
      [{ articleId: 7, lineCount: 12 }]
    )

    expect(rows).toHaveLength(2)
    expect(rows[0]?.soldBlLines).toBe(12)
    expect(rows[1]?.soldBlLines).toBe(0)
    expect(formatArticlesCsv(rows)).toBe(
      '\uFEFF' +
        [
          'IDArticle,Reference,Libelle,Famille,Sous_Famille,Classification,Categorie,Unite_Mesure,Poids_Brut,Lignes_BL_Type_23',
          '7,3/5,"Aliment, croissance ""N1""",Nutrition,Volaille,2,Finis,Q,25,12',
          '8,V-2,Vaccin,Veterinaire,,9,Sante,U,,0'
        ].join('\r\n') +
        '\r\n'
    )
  })

  it('décode les libellés HFSQL Unicode retournés sous forme d’octets UTF-16', () => {
    const rows = combineArticleRows(
      [
        {
          IDArticle: 24,
          Reference: windows1252Buffer('AL CROISSANCE N°2'),
          Libelle: utf16Buffer('Aliment Chair Croissance N°2 Granulé Sac')
        }
      ],
      []
    )

    expect(rows[0]?.Reference).toBe('AL CROISSANCE N°2')
    expect(rows[0]?.Libelle).toBe('Aliment Chair Croissance N°2 Granulé Sac')
  })

  it('affiche chaque valeur distincte avec son nombre et au plus trois exemples', () => {
    const rows = combineArticleRows(
      [
        {
          IDArticle: 1,
          Libelle: 'Mais A',
          Famille: 'Nutrition',
          Sous_Famille: 'Volaille',
          Classification: '2',
          Categorie: 'Finis'
        },
        {
          IDArticle: 2,
          Libelle: 'Mais B',
          Famille: 'Nutrition',
          Sous_Famille: 'Volaille',
          Classification: '2',
          Categorie: 'Finis'
        },
        {
          IDArticle: 3,
          Libelle: 'Mais C',
          Famille: 'Nutrition',
          Sous_Famille: 'Ruminant',
          Classification: '3',
          Categorie: 'Finis'
        },
        {
          IDArticle: 4,
          Libelle: 'Mais D',
          Famille: 'Nutrition',
          Sous_Famille: 'Autre',
          Classification: '4',
          Categorie: 'Finis'
        }
      ],
      []
    )

    const summary = summarizeArticleFacets(rows)
    expect(summary).toContain(
      'Famille: Nutrition | 4 article(s) | exemples : Mais A / Mais B / Mais C'
    )
    expect(summary).toContain('Sous_Famille: Volaille | 2 article(s) | exemples : Mais A / Mais B')
    expect(summary).not.toContain('Mais D /')
  })
})

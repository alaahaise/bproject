import type { ArticleCatalogGroup, ProductLine } from '@shared/types'
import { formatKg } from '../api'
import { useI18n } from '../i18n'
import Icon from './Icon'
import ArticlePicker from './ArticlePicker'

const EMPTY_LINE: ProductLine = { productCode: '', quantityKg: 0 }

/** Retire les lignes vides. Une ligne à moitié saisie est signalée par `hasIncompleteLine`. */
export function cleanLines(lines: ProductLine[]): ProductLine[] {
  return lines.filter((l) => l.productCode.trim() !== '' && l.quantityKg > 0)
}

/**
 * Une ligne avec un produit sans quantité (ou l'inverse) : la retirer en silence
 * ferait perdre à l'opérateur ce qu'il vient de taper, il faut le lui dire.
 */
export function hasIncompleteLine(lines: ProductLine[]): boolean {
  return lines.some((l) => {
    const hasProduct = l.productCode.trim() !== ''
    const hasQuantity = l.quantityKg > 0
    return hasProduct !== hasQuantity
  })
}

export function linesTotal(lines: ProductLine[]): number {
  return cleanLines(lines).reduce((sum, l) => sum + l.quantityKg, 0)
}

/**
 * Produits d'un ticket : un produit et sa quantité par ligne, la somme devenant
 * le poids supposé (« 1 t de CMV X » + « 4 t de CMV Y » = 5 t).
 */
export default function ProductLines({
  lines,
  onChange,
  disabled,
  group = 'all'
}: {
  lines: ProductLine[]
  onChange: (lines: ProductLine[]) => void
  disabled?: boolean
  group?: ArticleCatalogGroup
}) {
  const { t, lang } = useI18n()

  const patch = (index: number, changes: Partial<ProductLine>): void =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...changes } : line)))

  return (
    <fieldset className="lines">
      <legend className="field-label">{t('lines.title')}</legend>

      {lines.map((line, index) => (
        <div className="line-row" key={index}>
          <ArticlePicker
            ariaLabel={`${t('lines.product')} ${index + 1}`}
            value={line.productCode}
            group={group}
            disabled={disabled}
            onChange={(productCode) => patch(index, { productCode, productId: null })}
          />
          <span className="input-unit">
            <input
              aria-label={`${t('lines.quantity')} ${index + 1}`}
              placeholder={t('lines.qty')}
              type="number"
              step="0.001"
              min="0"
              dir="ltr"
              value={line.quantityKg === 0 ? '' : String(line.quantityKg)}
              disabled={disabled}
              onChange={(e) => patch(index, { quantityKg: Number(e.target.value) })}
            />
            <span aria-hidden="true">{t('lines.kg')}</span>
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            title={t('lines.remove')}
            disabled={disabled}
            onClick={() => onChange(lines.filter((_, i) => i !== index))}
          >
            <Icon name="trash" size={22} />
            <span className="sr-only">{t('lines.remove')}</span>
          </button>
        </div>
      ))}

      <div className="lines-foot">
        <button
          type="button"
          className="btn btn-soft"
          disabled={disabled}
          onClick={() => onChange([...lines, { ...EMPTY_LINE }])}
        >
          <Icon name="plus" size={20} />
          {t('lines.add')}
        </button>
        <span className="lines-total">
          {t('lines.total')} <strong dir="ltr">{formatKg(linesTotal(lines), lang)}</strong>
        </span>
      </div>

      {hasIncompleteLine(lines) && (
        <p className="field-error" role="alert">
          <Icon name="alert" size={18} />
          {t('lines.incomplete')}
        </p>
      )}
    </fieldset>
  )
}

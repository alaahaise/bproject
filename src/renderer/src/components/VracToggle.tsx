import type { OperationType } from '@shared/types'
import { canBeVrac } from '@shared/domain/vrac'
import { useI18n } from '../i18n'
import Segmented from './Segmented'

/**
 * « Est-ce du vrac ? » : marchandise vendue au poids, sans BL au moment de la
 * pesée. Réservé aux sorties qui ne sont pas des retours ; cocher « Retour » la
 * désactive (un retour a toujours son BL d'origine).
 */
export default function VracToggle({
  type,
  isRetour,
  checked,
  onChange,
  disabled = false
}: {
  type: OperationType
  isRetour: boolean
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  const { t } = useI18n()
  if (type !== 'SORTIE') return null

  return (
    <div className="field field-row">
      <span className="field-head-col">
        <span className="field-label">{t('station.vrac')}</span>
        <span className="field-hint">{t('station.vrac.hint')}</span>
      </span>
      <Segmented
        label={t('station.vrac')}
        value={checked ? 'yes' : 'no'}
        disabled={disabled || !canBeVrac(type, isRetour)}
        onChange={(value) => onChange(value === 'yes')}
        options={[
          { value: 'no', label: t('common.no'), tone: 'neutral' },
          { value: 'yes', label: t('station.vrac') }
        ]}
      />
    </div>
  )
}

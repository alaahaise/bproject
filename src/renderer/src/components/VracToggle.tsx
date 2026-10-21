import type { OperationType } from '@shared/types'
import { canBeVrac } from '@shared/domain/vrac'
import { useI18n } from '../i18n'

/**
 * Case « Vrac » : marchandise vendue au poids, sans BL au moment de la pesée.
 * Réservée aux sorties qui ne sont pas des retours ; cocher « Retour » la
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
    <div className="checks">
      <label className="inline">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled || !canBeVrac(type, isRetour)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <strong>{t('station.vrac')}</strong>
        <span className="muted">— {t('station.vrac.hint')}</span>
      </label>
    </div>
  )
}

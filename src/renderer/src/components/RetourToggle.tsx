import type { OperationType } from '@shared/types'
import { useI18n } from '../i18n'
import Segmented from './Segmented'

/** Seuls l'entrée et la sortie ont un cas « retour ». */
export const canBeRetour = (type: OperationType): boolean => type === 'ENTREE' || type === 'SORTIE'

/**
 * « Est-ce un retour ? » : marchandise vendue qui revient (entrée) ou
 * marchandise renvoyée, par exemple un CMV au fournisseur (sortie). La réponse
 * par défaut est « Non » ; une phrase explique ce qu'est un retour selon le type.
 * Question à gauche, réponse à droite : une seule ligne, pour que le formulaire
 * tienne à l'écran sans défilement.
 */
export default function RetourToggle({
  type,
  checked,
  onChange,
  disabled = false
}: {
  type: OperationType
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  const { t } = useI18n()
  if (!canBeRetour(type)) return null

  return (
    <div className="field field-row">
      <span className="field-head-col">
        <span className="field-label">{t('retour.question')}</span>
        <span className="field-hint">
          {t(`retour.help.${type === 'ENTREE' ? 'ENTREE' : 'SORTIE'}`)}
        </span>
      </span>
      <Segmented
        label={t('retour.question')}
        value={checked ? 'yes' : 'no'}
        disabled={disabled}
        onChange={(value) => onChange(value === 'yes')}
        options={[
          { value: 'no', label: t('common.no'), tone: 'neutral' },
          { value: 'yes', label: t('retour.yes') }
        ]}
      />
    </div>
  )
}

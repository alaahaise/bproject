import type { ReactNode } from 'react'
import { useI18n } from '../i18n'

/**
 * Un champ : le libellé est toujours écrit au-dessus (jamais dans le champ, qui
 * le ferait disparaître à la première lettre), l'aide en dessous. Le libellé
 * enveloppe le champ : un clic sur le mot place le curseur dans la case.
 */
export default function Field({
  label,
  hint,
  optional = false,
  children
}: {
  label: string
  hint?: string
  optional?: boolean
  children: ReactNode
}) {
  const { t } = useI18n()
  return (
    <label className="field">
      <span className="field-head">
        <span className="field-label">
          {label}
          {optional && <span className="field-opt"> ({t('common.optional')})</span>}
        </span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

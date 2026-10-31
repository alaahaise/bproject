import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import Icon, { type IconName } from './Icon'

export type GuideTone = 'info' | 'ok' | 'warn' | 'error'

const ICONS: Record<GuideTone, IconName> = {
  info: 'info',
  ok: 'check-circle',
  warn: 'alert',
  error: 'alert'
}

/**
 * Message en une phrase : ce qu'il faut faire maintenant, ou ce qui ne va pas.
 * L'icône et le ton (couleur) s'ajoutent au texte, ils ne le remplacent pas.
 */
export default function Guide({
  tone = 'info',
  title,
  children,
  onDismiss
}: {
  tone?: GuideTone
  title?: string
  children: ReactNode
  onDismiss?: () => void
}) {
  const { t } = useI18n()
  return (
    <div className={`guide guide-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={ICONS[tone]} />
      <div className="guide-text">
        {title && <strong>{title}</strong>}
        <span>{children}</span>
      </div>
      {onDismiss && (
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onDismiss}>
          <Icon name="x" size={18} />
          <span className="sr-only">{t('common.dismiss')}</span>
        </button>
      )}
    </div>
  )
}

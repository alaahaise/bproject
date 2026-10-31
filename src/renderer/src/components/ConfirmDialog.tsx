import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import Dialog from './Dialog'
import Icon, { type IconName } from './Icon'

/**
 * Confirmation d'une action qu'on ne défait pas : la question dit ce qui va se
 * passer, le bouton reprend le verbe (« Annuler ce ticket », pas « OK »), et le
 * refus est proposé aussi en toutes lettres.
 */
export default function ConfirmDialog({
  open,
  title,
  confirmLabel,
  cancelLabel,
  icon = 'check',
  danger = false,
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children
}: {
  open: boolean
  title: string
  confirmLabel: string
  cancelLabel?: string
  icon?: IconName
  danger?: boolean
  busy?: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}) {
  const { t } = useI18n()
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            type="button"
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
          >
            <Icon name={icon} />
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  )
}

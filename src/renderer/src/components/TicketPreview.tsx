import { useI18n } from '../i18n'
import Dialog from './Dialog'
import Icon from './Icon'

/**
 * Aperçu du ticket, rendu dans un cadre à partir du HTML que le processus
 * principal enverra à l'imprimante : ce que l'opérateur voit est exactement ce
 * qui sortira sur le papier.
 */
export default function TicketPreview({
  html,
  onPrint,
  onClose,
  busy
}: {
  html: string
  onPrint: () => void
  onClose: () => void
  busy: boolean
}) {
  const { t } = useI18n()
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('ticket.previewTitle')}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.close')}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={onPrint}
            disabled={busy}
          >
            <Icon name="printer" />
            {t('ops.print')}
          </button>
        </>
      }
    >
      <iframe title={t('ticket.previewTitle')} className="ticket-frame" srcDoc={html} />
    </Dialog>
  )
}

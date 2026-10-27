import type { Operation } from '@shared/types'
import { formatDateTime, formatKg } from '../api'
import ManualMark from './ManualMark'
import { useI18n } from '../i18n'

/** One waiting ticket, with the next action made obvious. */
export default function PendingTicketCard({
  ticket,
  onOpen
}: {
  ticket: Operation
  onOpen: (ticket: Operation) => void
}) {
  const { t, lang } = useI18n()

  return (
    <article className="pending-ticket">
      <div className="pending-ticket-head">
        <strong className="pending-ticket-number">{ticket.ticketNo}</strong>
        <div>
          {ticket.isRetour && <span className="badge warn">{t('station.retour')}</span>}
          {ticket.isVrac && <span className="badge warn">{t('station.vrac')}</span>}
        </div>
      </div>

      <div className="pending-plate">
        <span className="muted">{t('station.plate')}</span>
        <strong>{ticket.plate || '—'}</strong>
      </div>

      <dl className="pending-details">
        <div>
          <dt>{t('station.driver')}</dt>
          <dd>{ticket.driverName || '—'}</dd>
        </div>
        <div>
          <dt>{t('station.firstWeigh')}</dt>
          <dd>
            {formatKg(ticket.first?.weight, lang)}
            {ticket.first?.isManual && <ManualMark />}
          </dd>
          <small>{formatDateTime(ticket.first?.at)}</small>
        </div>
      </dl>

      <button type="button" className="primary big pending-open" onClick={() => onOpen(ticket)}>
        {t('bal2.choose')}
      </button>
    </article>
  )
}

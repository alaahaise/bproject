import type { ReactNode } from 'react'
import type { Operation } from '@shared/types'
import { formatDateTime, formatKg } from '../api'
import { useI18n } from '../i18n'
import Icon from './Icon'
import ManualMark from './ManualMark'

/**
 * Le camion sur la balance : son matricule dans un cadre qui rappelle la plaque
 * (c'est par lui qu'on retrouve un camion), puis chauffeur, 1re pesée et ticket.
 */
export default function TruckCard({
  op,
  children
}: {
  op: Pick<Operation, 'plate' | 'driverName' | 'first' | 'ticketNo' | 'isRetour'>
  children?: ReactNode
}) {
  const { t, lang } = useI18n()
  return (
    <section className="truck-card" aria-label={t('truck.title')}>
      <header>
        <Icon name="truck" size={22} />
        <h3>{t('truck.title')}</h3>
        {op.isRetour && <span className="chip chip-retour">{t('station.retour')}</span>}
      </header>
      <div className="plate" dir="ltr">
        {op.plate || '—'}
      </div>
      <dl>
        <div>
          <dt>{t('station.driver')}</dt>
          <dd>{op.driverName || '—'}</dd>
        </div>
        <div>
          <dt>{t('truck.ticket')}</dt>
          <dd>
            <span className="ticket-no">{op.ticketNo}</span>
          </dd>
        </div>
        <div className="is-wide">
          <dt>{t('station.firstWeigh')}</dt>
          <dd>
            <strong className="digits">{formatKg(op.first?.weight, lang)}</strong>
            {op.first?.isManual && <ManualMark />}
            <small>{op.first ? formatDateTime(op.first.at) : '—'}</small>
          </dd>
        </div>
      </dl>
      {children && <div className="truck-actions">{children}</div>}
    </section>
  )
}

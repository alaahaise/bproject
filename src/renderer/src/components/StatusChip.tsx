import { ticketStage, type TicketStage } from '@shared/domain/ticket-stage'
import type { Operation } from '@shared/types'
import { useI18n, type TKey } from '../i18n'
import Icon, { type IconName } from './Icon'

const STAGES: Record<TicketStage, { icon: IconName; key: TKey }> = {
  waiting: { icon: 'clock', key: 'ops.chip.waiting' },
  toSave: { icon: 'alert', key: 'ops.chip.toSave' },
  done: { icon: 'check', key: 'ops.chip.done' },
  cancelled: { icon: 'x', key: 'ops.chip.cancelled' }
}

/** Où en est le ticket : une icône, un mot et une couleur (jamais la couleur seule). */
export default function StatusChip({ op }: { op: Pick<Operation, 'status' | 'second'> }) {
  const { t } = useI18n()
  const stage = ticketStage(op)
  const { icon, key } = STAGES[stage]
  return (
    <span className={`chip chip-${stage}`}>
      <Icon name={icon} size={16} />
      {t(key)}
    </span>
  )
}

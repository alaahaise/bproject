import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import DateRangeFilter from './DateRangeFilter'
import Icon from './Icon'

/**
 * Barre de filtres des listes de tickets : la recherche d'abord (c'est ce qu'on
 * utilise le plus), la période ensuite. Les filtres propres à un écran passent
 * en `children` et se placent après.
 */
export default function TicketFilters({
  search,
  onSearch,
  placeholder,
  dateFrom,
  dateTo,
  onDateFrom,
  onDateTo,
  autoFocus = false,
  children
}: {
  search: string
  onSearch: (value: string) => void
  placeholder: string
  dateFrom: string
  dateTo: string
  onDateFrom: (value: string) => void
  onDateTo: (value: string) => void
  autoFocus?: boolean
  children?: ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className="filter-bar">
      <label className="search-box">
        <Icon name="search" size={22} />
        <span className="sr-only">{t('common.search')}</span>
        <input
          type="search"
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </label>
      <DateRangeFilter from={dateFrom} to={dateTo} onFrom={onDateFrom} onTo={onDateTo} />
      {children}
    </div>
  )
}

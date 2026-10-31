import type { ReactNode } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  /** `neutral` : l'option « par défaut » (ex. « Non ») ne doit pas crier autant que l'exception. */
  tone?: 'neutral'
}

/**
 * Choix entre peu d'options, toutes visibles d'un coup (plutôt qu'une liste
 * déroulante qu'il faut ouvrir pour savoir ce qu'elle contient).
 */
export default function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className = ''
}: {
  label: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={`segmented ${className}`.trim()} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.tone === 'neutral' ? 'segmented-btn is-neutral' : 'segmented-btn'}
          aria-pressed={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}

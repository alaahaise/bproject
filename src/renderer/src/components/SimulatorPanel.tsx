import { useState } from 'react'
import { parseTypedWeight } from '@shared/domain/capture'
import { api, call, errorMessage } from '../api'
import { useI18n } from '../i18n'
import Icon from './Icon'

/**
 * Commande du simulateur de balance : poser un poids sur le pont virtuel.
 * Affiché uniquement quand le poste est en mode simulateur (Paramètres), en bande
 * fine tout en bas : en production, il n'existe pas.
 */
export default function SimulatorPanel() {
  const { t } = useI18n()
  const [value, setValue] = useState('30000')
  const [error, setError] = useState<string | null>(null)

  async function place(kg: number): Promise<void> {
    setError(null)
    try {
      await call(api.balance.simSet(kg))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const kg = parseTypedWeight(value)

  return (
    <aside className="sim-panel" aria-label={t('console.simulation')}>
      <strong>
        <Icon name="alert" size={20} />
        {t('sim.banner')}
      </strong>
      <label className="inline">
        {t('sim.weight')}
        <input
          type="number"
          min={0}
          step={10}
          dir="ltr"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={kg == null}
        onClick={() => kg != null && void place(kg)}
      >
        {t('sim.place')}
      </button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void place(0)}>
        {t('sim.empty')}
      </button>
      {error && <span className="field-error">{error}</span>}
    </aside>
  )
}

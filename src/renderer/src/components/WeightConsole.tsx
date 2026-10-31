import type { WeightSample } from '@shared/types'
import { formatWeightNumber } from '../api'
import { useI18n } from '../i18n'
import Icon from './Icon'

/**
 * Le poids de la balance, en grand, comme l'afficheur d'un pont-bascule : un
 * panneau sombre en haut de l'écran, lisible de loin. Il dit aussi, avec des
 * mots, si le poids est stable (donc prêt à être enregistré) ou si la balance
 * est éteinte.
 */
export default function WeightConsole({
  sample,
  running,
  simulated,
  busy,
  onStart
}: {
  sample: WeightSample | null
  running: boolean
  simulated: boolean
  busy: boolean
  onStart: () => void
}) {
  const { t, lang } = useI18n()

  const state = !running && !sample ? 'off' : !sample ? 'wait' : sample.stable ? 'stable' : 'moving'

  return (
    <section className={`console console-${state}`} aria-label={t('console.label')}>
      <div className="console-main">
        <span className="console-label">
          <Icon name="scale" size={22} />
          {t('console.label')}
        </span>
        <output className="console-digits" dir="ltr">
          <span className="console-number">{formatWeightNumber(sample?.weight ?? null, lang)}</span>
          <span className="console-unit">kg</span>
        </output>
      </div>

      <div className="console-state" role="status">
        {state === 'off' && (
          <>
            <span className="state state-off">
              <Icon name="alert" size={22} />
              {t('console.off')}
            </span>
            <button type="button" className="btn btn-light" disabled={busy} onClick={onStart}>
              <Icon name="play" size={18} />
              {t('console.start')}
            </button>
          </>
        )}
        {state === 'wait' && (
          <span className="state state-wait">
            <span className="pulse" aria-hidden="true" />
            {t('console.waiting')}
          </span>
        )}
        {state === 'moving' && (
          <span className="state state-moving">
            <span className="pulse" aria-hidden="true" />
            {t('console.moving')}
          </span>
        )}
        {state === 'stable' && (
          <span className="state state-stable">
            <Icon name="check-circle" size={26} />
            {t('console.stable')}
          </span>
        )}
        {simulated && <span className="chip chip-sim">{t('console.simulation')}</span>}
      </div>
    </section>
  )
}

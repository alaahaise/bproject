import { useI18n } from '../i18n'
import Icon from './Icon'

/** 1 = 1re pesée, 2 = chargement/déchargement, 3 = 2e pesée, 4 = ticket final, 5 = tout est fait. */
export type JourneyStep = 1 | 2 | 3 | 4 | 5

/**
 * Le parcours d'un camion en quatre étapes, avec « vous êtes ici ». C'est la
 * raison d'être de l'application, dite une fois pour toutes : un camion passe
 * deux fois sur la balance, et le ticket n'est final qu'après la 2e pesée.
 */
export default function JourneyCard({ step }: { step: JourneyStep }) {
  const { t } = useI18n()

  const items = [
    { title: t('station.firstWeigh'), sub: t('journey.1.sub') },
    { title: t('journey.2'), sub: t('journey.2.sub'), outside: true },
    { title: t('station.secondWeigh'), sub: t('journey.3.sub') },
    { title: t('journey.4'), sub: t('journey.4.sub') }
  ]

  return (
    <section className="journey" aria-label={t('journey.title')}>
      <h3>{t('journey.title')}</h3>
      <ol>
        {items.map((item, index) => {
          const number = index + 1
          const state = number < step ? 'done' : number === step ? 'current' : 'todo'
          return (
            <li
              key={number}
              className={`journey-step is-${state}${item.outside ? ' is-outside' : ''}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="journey-dot" aria-hidden="true">
                {state === 'done' ? (
                  <Icon name="check" size={18} />
                ) : item.outside ? (
                  <Icon name="truck" size={18} />
                ) : (
                  number
                )}
              </span>
              <span className="journey-text">
                <strong>{item.title}</strong>
                <small>{item.sub}</small>
                {state === 'current' && <em>{t('journey.here')}</em>}
                {state === 'done' && <span className="sr-only">{t('journey.done')}</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

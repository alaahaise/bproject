import { useState } from 'react'
import { captureBlock, parseTypedWeight, type FormBlock } from '@shared/domain/capture'
import type { WeightSample } from '@shared/types'
import { formatKg } from '../api'
import { useI18n } from '../i18n'
import Icon from './Icon'

export interface CaptureRequest {
  weight: number
  /** Poids tapé au clavier : marqué « M » sur le ticket, sans lecture de balance à tracer. */
  manual: boolean
}

/**
 * La barre d'action du bas, identique sur les deux balances : le gros bouton qui
 * enregistre la pesée (avec le poids qu'il va enregistrer écrit dedans), et à
 * côté la phrase qui dit pourquoi il est grisé.
 *
 * Deux façons de peser : lire la balance (poids stable uniquement), ou taper le
 * poids quand la balance ne répond pas. Un poids tapé est marqué « M » sur le ticket.
 */
export default function CaptureBar({
  label,
  sample,
  running,
  busy,
  block = null,
  onCapture,
  onCancel,
  cancelLabel
}: {
  label: string
  sample: WeightSample | null
  running: boolean
  busy: boolean
  /** Saisie incomplète ailleurs dans la page : on ne laisse pas peser. */
  block?: FormBlock | null
  onCapture: (request: CaptureRequest) => void
  onCancel?: () => void
  cancelLabel?: string
}) {
  const { t, lang } = useI18n()
  const [manual, setManual] = useState(false)
  const [typed, setTyped] = useState('')

  const typedKg = parseTypedWeight(typed)
  const reason = captureBlock({
    busy,
    formBlock: block,
    manual,
    typedValid: typedKg != null,
    running,
    hasSample: sample != null,
    stable: sample?.stable === true
  })
  const ready = reason === null
  const shownWeight = manual ? typedKg : (sample?.weight ?? null)

  function capture(): void {
    if (!ready) return
    if (manual && typedKg != null) onCapture({ weight: typedKg, manual: true })
    else if (!manual && sample) onCapture({ weight: sample.weight, manual: false })
  }

  return (
    <footer className={`capture-bar${ready ? ' is-ready' : ''}`}>
      <div className="capture-manual">
        <button
          type="button"
          className="btn btn-link"
          aria-pressed={manual}
          title={t('cap.manual')}
          onClick={() => setManual(!manual)}
        >
          <Icon name={manual ? 'scale' : 'keyboard'} size={20} />
          {manual ? t('capture.manualOff') : t('capture.manualToggle')}
        </button>
        {manual && (
          <label className="manual-field">
            <span className="field-label">{t('cap.manualWeight')}</span>
            <input
              type="number"
              min={0}
              max={1_000_000}
              step="0.001"
              inputMode="decimal"
              autoFocus
              dir="ltr"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') capture()
              }}
            />
            <small className="field-hint">{t('cap.manualHint')}</small>
          </label>
        )}
      </div>

      <p className={`capture-why ${ready ? 'why-ready' : 'why-wait'}`} role="status">
        <Icon name={ready ? 'check-circle' : 'clock'} size={22} />
        {ready ? t('capture.ready') : t(`guide.block.${reason}`)}
      </p>

      <div className="capture-actions">
        {onCancel && (
          <button type="button" className="btn btn-secondary btn-lg" onClick={onCancel}>
            {cancelLabel ?? t('common.cancel')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary btn-xl"
          disabled={!ready}
          onClick={capture}
        >
          <Icon name="scale" size={30} />
          <span className="btn-xl-text">
            <span>{label}</span>
            {shownWeight != null && <small dir="ltr">{formatKg(shownWeight, lang)}</small>}
          </span>
        </button>
      </div>
    </footer>
  )
}

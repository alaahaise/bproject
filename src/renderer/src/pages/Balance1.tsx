import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FormBlock } from '@shared/domain/capture'
import { articleGroupForOperation } from '@shared/domain/article-catalog'
import { normalizePlate, staleTicketsForPlate } from '@shared/domain/plate'
import { productKnownAtFirstWeighing } from '@shared/domain/weighing'
import type { Operation, OperationType, ProductLine, WeightSample } from '@shared/types'
import { api, call, errorMessage, formatDateTime, formatKg, notifyTicketsChanged } from '../api'
import CaptureBar, { type CaptureRequest } from '../components/CaptureBar'
import ConfirmDialog from '../components/ConfirmDialog'
import Field from '../components/Field'
import Guide from '../components/Guide'
import Icon from '../components/Icon'
import JourneyCard from '../components/JourneyCard'
import ProductLines, { cleanLines, hasIncompleteLine } from '../components/ProductLines'
import RetourToggle from '../components/RetourToggle'
import SimulatorPanel from '../components/SimulatorPanel'
import TicketPreview from '../components/TicketPreview'
import TruckCard from '../components/TruckCard'
import VracGroupPicker from '../components/VracGroupPicker'
import VracToggle from '../components/VracToggle'
import WeightConsole from '../components/WeightConsole'
import { useBalance } from '../hooks/useBalance'
import { useI18n } from '../i18n'
import { operationPath } from '../navigation'

/** Une entrée démarre avec une ligne produit prête à remplir ; les autres types n'en ont pas ici. */
const blankLines = (type: OperationType): ProductLine[] =>
  productKnownAtFirstWeighing(type) ? [{ productCode: '', quantityKg: 0 }] : []

/**
 * Première balance : le camion arrive, on saisit matricule et chauffeur, on pèse.
 *
 * La pesée crée le ticket et l'enregistre : le « bon de pesée n° 1 » est donc
 * imprimable tout de suite, sans attendre la 2e balance.
 *
 * Pour une entrée, le produit et la quantité attendue sont déjà connus et se
 * saisissent ici. Pour une sortie, le camion arrive à vide : ils se saisissent à
 * la 2e balance. Le reste (tiers, lieux) se complète toujours à la 2e balance.
 */
export default function Balance1({ type }: { type: OperationType }) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [plate, setPlate] = useState('')
  const [driverName, setDriverName] = useState('')
  const [notes, setNotes] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [isRetour, setIsRetour] = useState(false)
  const [isVrac, setIsVrac] = useState(false)
  const [vracGroupId, setVracGroupId] = useState<number | null>(null)
  const [lines, setLines] = useState<ProductLine[]>(() => blankLines(type))
  const [ticket, setTicket] = useState<Operation | null>(null)
  // Camion repassé sur la balance : la 1re pesée du ticket existant est à refaire.
  const [redo, setRedo] = useState(false)
  const [busy, setBusy] = useState(false)
  // Anciens tickets du même camion, restés sans 2e pesée (voir plus bas).
  const [stale, setStale] = useState<Operation[]>([])
  const [confirmCancel, setConfirmCancel] = useState<Operation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ id: number; html: string } | null>(null)

  const ticketRef = useRef<Operation | null>(null)
  const knowsProduct = productKnownAtFirstWeighing(type)
  const incomplete = knowsProduct && hasIncompleteLine(lines)

  const captureFirst = useCallback(
    async (weight: number, manual: boolean, source: WeightSample | null): Promise<void> => {
      if (!ticketRef.current && knowsProduct && hasIncompleteLine(lines)) {
        setError(t('lines.incomplete'))
        return
      }
      if (!ticketRef.current && stale.length > 0) {
        setError(t('bal1.dup.hint'))
        return
      }
      setBusy(true)
      setError(null)
      try {
        let current = ticketRef.current
        const isRedo = current != null && redo
        if (!current) {
          const clean = knowsProduct ? cleanLines(lines) : []
          current = await call(
            api.ops.create({
              type,
              isRetour,
              isVrac,
              vracGroupId: isVrac ? vracGroupId : null,
              plate: plate || null,
              driverName: driverName || null,
              notes: notes || null,
              lines: clean.length > 0 ? clean : undefined
            })
          )
          ticketRef.current = current
        }
        const payload = {
          operationId: current.id,
          weight,
          isManual: manual,
          stableMs: source?.stableMs ?? null,
          // Poids tapé au clavier : pas de trame de la balance, on le dit dans la trace.
          raw: source?.raw ? source.raw.slice(-255) : manual && !source ? 'MANUEL' : null
        }
        const updated = await call(isRedo ? api.ops.redoFirst(payload) : api.ops.capture(payload))
        if (isRedo) stopRedo()
        ticketRef.current = updated
        setTicket(updated)
        notifyTicketsChanged()
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        setBusy(false)
      }
    },
    [
      type,
      isRetour,
      isVrac,
      vracGroupId,
      plate,
      driverName,
      notes,
      lines,
      knowsProduct,
      redo,
      stale,
      t
    ]
  )

  const balance = useBalance(setError)

  function stopRedo(): void {
    setRedo(false)
  }

  function startRedo(): void {
    setRedo(true)
    setError(null)
  }

  function reset(): void {
    stopRedo()
    ticketRef.current = null
    setTicket(null)
    setPlate('')
    setDriverName('')
    setNotes('')
    setShowNote(false)
    setIsRetour(false)
    setIsVrac(false)
    setVracGroupId(null)
    setLines(blankLines(type))
    setError(null)
  }

  // Changer de menu change de type : repartir d'un camion vierge.
  useEffect(() => {
    reset()
  }, [type])

  // Un camion qui n'est jamais revenu à la 2e balance garde un ticket ouvert. S'il se
  // représente pour une nouvelle 1re pesée, l'ancien ticket doit être annulé avant.
  useEffect(() => {
    if (ticket || normalizePlate(plate) === '') {
      setStale([])
      return
    }
    let active = true
    const timer = setTimeout(() => {
      call(api.ops.list({ status: 'OUVERTE', awaitingSecond: true, search: plate, limit: 500 }))
        .then((rows) => {
          if (active) setStale(staleTicketsForPlate(rows, plate, isVrac))
        })
        .catch(() => undefined)
    }, 350)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [plate, ticket, isVrac])

  async function cancelStale(op: Operation): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await call(api.ops.cancel(op.id, t('bal1.dup.reason')))
      setStale((rows) => rows.filter((row) => row.id !== op.id))
      setConfirmCancel(null)
      notifyTicketsChanged()
    } catch (err) {
      setError(errorMessage(err))
      setConfirmCancel(null)
    } finally {
      setBusy(false)
    }
  }

  async function captureNow(request: CaptureRequest): Promise<void> {
    await captureFirst(request.weight, request.manual, request.manual ? null : balance.sample)
  }

  async function printTicket(id: number): Promise<void> {
    setBusy(true)
    try {
      const result = await call(api.ops.print(id, lang))
      if (!result.ok) setError(result.message)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function openPreview(id: number): Promise<void> {
    setBusy(true)
    try {
      setPreview({ id, html: await call(api.ops.html(id, lang)) })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const block: FormBlock | null = redo
    ? null
    : incomplete
      ? 'incompleteLines'
      : stale.length > 0
        ? 'staleTicket'
        : null

  return (
    <div className="station">
      <WeightConsole
        sample={balance.sample}
        running={balance.running}
        simulated={balance.simulated}
        busy={busy}
        onStart={() => void balance.startBalance()}
      />

      {error && (
        <Guide tone="error" title={t('common.error')} onDismiss={() => setError(null)}>
          {error}
        </Guide>
      )}

      <div className="work">
        {!ticket && (
          <>
            <section className="panel form-panel" aria-labelledby="b1-title">
              <h2 id="b1-title" className="sr-only">
                {t('b1.title')}
              </h2>
              <div className="form-col">
                <Field label={t('station.plate')} hint={t('form.plateHint')}>
                  <input
                    autoFocus
                    autoComplete="off"
                    dir="ltr"
                    className="input-plate"
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                  />
                </Field>

                {stale.length > 0 && (
                  <div className="stale-box" role="alert">
                    <strong>
                      <Icon name="alert" size={22} />
                      {t('bal1.dup.title')}
                    </strong>
                    {stale.map((op) => (
                      <div className="stale-row" key={op.id}>
                        <span>
                          <b className="ticket-no">{op.ticketNo}</b> ·{' '}
                          {t(`station.type.${op.type}`)} · {formatKg(op.first?.weight, lang)}
                          {op.first ? ` · ${formatDateTime(op.first.at)}` : ''}
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={busy}
                          onClick={() =>
                            navigate(`${operationPath(op.type)}/balance-2`, {
                              state: { pendingTicket: op }
                            })
                          }
                        >
                          {t('bal1.dup.open')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={busy}
                          onClick={() => setConfirmCancel(op)}
                        >
                          {t('bal1.dup.cancel')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <Field label={t('station.driver')} optional>
                  <input
                    autoComplete="off"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                  />
                </Field>

                <RetourToggle
                  type={type}
                  checked={isRetour}
                  onChange={(value) => {
                    setIsRetour(value)
                    // Un retour a toujours son BL d'origine : jamais du vrac.
                    if (value) setIsVrac(false)
                  }}
                  disabled={busy}
                />

                <VracToggle
                  type={type}
                  isRetour={isRetour}
                  checked={isVrac}
                  onChange={setIsVrac}
                  disabled={busy}
                />

                {isVrac && (
                  <VracGroupPicker
                    plate={plate}
                    value={vracGroupId}
                    onChange={setVracGroupId}
                    disabled={busy}
                  />
                )}

                {knowsProduct ? (
                  <ProductLines
                    lines={lines}
                    onChange={setLines}
                    disabled={busy}
                    group={articleGroupForOperation(type, isRetour)}
                  />
                ) : (
                  <p className="hint-box">
                    <Icon name="info" size={20} />
                    {t('bal1.productLater')}
                  </p>
                )}

                {showNote || notes !== '' ? (
                  <Field label={t('station.notes')} optional>
                    <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </Field>
                ) : (
                  <button type="button" className="btn btn-link" onClick={() => setShowNote(true)}>
                    <Icon name="plus" size={20} />
                    {t('form.addNote')}
                  </button>
                )}
              </div>
            </section>

            <aside className="side">
              <JourneyCard step={1} />
            </aside>
          </>
        )}

        {ticket && (
          <>
            <section className="panel result-panel" aria-labelledby="b1-result">
              {redo ? (
                <Guide tone="warn">
                  {t('bal.redoHint', { weight: formatKg(ticket.first?.weight, lang) })}
                </Guide>
              ) : (
                <>
                  <div className="result-hero">
                    <Icon name="check-circle" size={52} />
                    <div>
                      <h2 id="b1-result">{t('b1.doneTitle')}</h2>
                      <p>
                        <span className="ticket-no">{ticket.ticketNo}</span>
                        {ticket.isRetour && (
                          <span className="chip chip-retour">{t('station.retour')}</span>
                        )}
                        {ticket.isVrac && (
                          <span className="chip chip-warn">{t('station.vrac')}</span>
                        )}
                        {ticket.first && <> · {formatDateTime(ticket.first.at)}</>}
                      </p>
                      <p className="hero-note">{t('b1.doneGuide')}</p>
                    </div>
                  </div>

                  {ticket.lines.length > 0 && (
                    <div className="lines-readonly">
                      <h3>{t('lines.title')}</h3>
                      {ticket.lines.map((line, index) => (
                        <div className="lines-readonly-row" key={index}>
                          <span>{line.productCode}</span>
                          <strong className="digits">{formatKg(line.quantityKg, lang)}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="result-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-xl"
                      disabled={busy}
                      onClick={() => void printTicket(ticket.id)}
                    >
                      <Icon name="printer" size={30} />
                      {t('bal1.printFirst')}
                    </button>
                    <button type="button" className="btn btn-secondary btn-xl" onClick={reset}>
                      <Icon name="truck" size={30} />
                      {t('bal1.new')}
                    </button>
                  </div>

                  <div className="result-more">
                    <span>{t('b1.more')}</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => void openPreview(ticket.id)}
                    >
                      <Icon name="eye" size={18} />
                      {t('station.preview')}
                    </button>
                    {!ticket.second && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busy}
                        onClick={startRedo}
                      >
                        <Icon name="redo" size={18} />
                        {t('bal.redo')}
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>

            <aside className="side">
              <TruckCard op={ticket} />
              <JourneyCard step={redo ? 1 : 2} />
            </aside>
          </>
        )}
      </div>

      {(!ticket || redo) && (
        <CaptureBar
          label={redo ? t('bal.redoCapture') : t('capture.first')}
          sample={balance.sample}
          running={balance.running}
          busy={busy}
          block={block}
          onCapture={(request) => void captureNow(request)}
          onCancel={redo ? stopRedo : undefined}
          cancelLabel={t('capture.cancelRedo')}
        />
      )}

      {balance.simulated && <SimulatorPanel />}

      <ConfirmDialog
        open={confirmCancel != null}
        danger
        icon="trash"
        busy={busy}
        title={t('ops.cancelAsk', { ticket: confirmCancel?.ticketNo ?? '' })}
        confirmLabel={t('bal1.dup.cancel')}
        cancelLabel={t('ops.keep')}
        onCancel={() => setConfirmCancel(null)}
        onConfirm={() => confirmCancel && void cancelStale(confirmCancel)}
      >
        <p>{t('ops.cancelWarn')}</p>
      </ConfirmDialog>

      {preview && (
        <TicketPreview
          html={preview.html}
          busy={busy}
          onClose={() => setPreview(null)}
          onPrint={() => {
            const id = preview.id
            setPreview(null)
            void printTicket(id)
          }}
        />
      )}
    </div>
  )
}

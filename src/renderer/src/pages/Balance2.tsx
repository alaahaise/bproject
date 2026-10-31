import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import type { Location, OpUpdate } from '@shared/channels'
import type { FormBlock } from '@shared/domain/capture'
import { articleGroupForOperation } from '@shared/domain/article-catalog'
import { asksFrom, asksTo, locationFieldsFor } from '@shared/domain/locations'
import { allowsBl, requiresBlForSecondWeigh } from '@shared/domain/operation-fields'
import { isManualKind } from '@shared/domain/weighing'
import type {
  BlLookup,
  Operation,
  OperationType,
  ProductLine,
  VracGroup,
  WeightSample
} from '@shared/types'
import { api, call, errorMessage, formatDateTime, formatKg, notifyTicketsChanged } from '../api'
import CaptureBar, { type CaptureRequest } from '../components/CaptureBar'
import ArticlePicker from '../components/ArticlePicker'
import ConfirmDialog from '../components/ConfirmDialog'
import Field from '../components/Field'
import Guide from '../components/Guide'
import Icon from '../components/Icon'
import JourneyCard from '../components/JourneyCard'
import LocationPickers from '../components/LocationPickers'
import ManualMark from '../components/ManualMark'
import Pagination from '../components/Pagination'
import ProductLines, { cleanLines, hasIncompleteLine } from '../components/ProductLines'
import RetourToggle from '../components/RetourToggle'
import SimulatorPanel from '../components/SimulatorPanel'
import StatusChip from '../components/StatusChip'
import TicketFilters from '../components/TicketFilters'
import TicketPreview from '../components/TicketPreview'
import TruckCard from '../components/TruckCard'
import VracToggle from '../components/VracToggle'
import WeightConsole from '../components/WeightConsole'
import { useBalance } from '../hooks/useBalance'
import { useTicketPage } from '../hooks/useTicketPage'
import { useI18n } from '../i18n'

interface CompleteForm {
  isRetour: boolean
  isVrac: boolean
  vracProduct: string
  partnerName: string
  blNo: string
  blDate: string
  locationFromId: string
  locationToId: string
  notes: string
}

/**
 * Champs descriptifs saisis à l'écran, au format de `ops.update`.
 * Seuls les lieux que ce type de ticket demande sont envoyés : le serveur fixe
 * les autres (une sortie part du stock central vers l'extérieur).
 */
function infoPatch(form: CompleteForm, type: OperationType): OpUpdate {
  const fields = locationFieldsFor(type, form.isRetour)
  const patch: OpUpdate = {
    isRetour: form.isRetour,
    isVrac: form.isVrac,
    partnerName: form.partnerName || null,
    blNo: allowsBl(type, form.isRetour) ? form.blNo || null : null,
    blDate: allowsBl(type, form.isRetour) ? form.blDate || null : null,
    notes: form.notes || null
  }
  if (asksFrom(fields)) {
    patch.locationFromId = form.locationFromId === '' ? null : Number(form.locationFromId)
  }
  if (asksTo(fields)) {
    patch.locationToId = form.locationToId === '' ? null : Number(form.locationToId)
  }
  return patch
}

const EMPTY_FORM: CompleteForm = {
  isRetour: false,
  isVrac: false,
  vracProduct: '',
  partnerName: '',
  blNo: '',
  blDate: '',
  locationFromId: '',
  locationToId: '',
  notes: ''
}

/**
 * Deuxième balance : on reprend un ticket déjà pesé une fois, on complète ce qui
 * manque (produits, tiers, lieux), puis on pèse la 2e fois.
 *
 * Le poids supposé est la somme des produits déclarés ; l'écart se calcule
 * contre elle. Les produits sont envoyés avec la pesée, pour qu'un total resté
 * à l'écran ne puisse pas décaler l'écart.
 */
export default function Balance2({ type }: { type: OperationType }) {
  const { t, lang } = useI18n()
  const location = useLocation()
  const pendingTicket = (location.state as { pendingTicket?: Operation } | null)?.pendingTicket
  const [selected, setSelected] = useState<Operation | null>(null)
  const [form, setForm] = useState<CompleteForm>(EMPTY_FORM)
  const [lines, setLines] = useState<ProductLine[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  // Enlèvement du ticket vrac pesé : son total court avec chaque rotation.
  const [vracGroup, setVracGroup] = useState<VracGroup | null>(null)
  const [showNote, setShowNote] = useState(false)
  // Camion repassé sur la balance : la 1re pesée du ticket choisi est à refaire.
  const [redo, setRedo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmSave, setConfirmSave] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blBusy, setBlBusy] = useState(false)
  const [blNotice, setBlNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)
  const [loadedBl, setLoadedBl] = useState<BlLookup | null>(null)
  const [manualProducts, setManualProducts] = useState(false)
  const [pendingBlReference, setPendingBlReference] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ id: number; html: string } | null>(null)

  const ticketRef = useRef<Operation | null>(null)

  // Vrac pesé : afficher le total de l'enlèvement auquel cette rotation s'ajoute.
  const vracGroupId = selected?.vracGroupId ?? null
  const secondDone = selected?.second != null
  useEffect(() => {
    if (vracGroupId == null || !secondDone) {
      setVracGroup(null)
      return
    }
    let alive = true
    call(api.vrac.get(vracGroupId))
      .then((group) => alive && setVracGroup(group))
      .catch(() => alive && setVracGroup(null))
    return () => {
      alive = false
    }
  }, [vracGroupId, secondDone])

  // Liste paginée côté serveur : tickets pesés une fois, en attente de la 2e pesée.
  const list = useTicketPage({ type, status: 'OUVERTE', awaitingSecond: true })

  useEffect(() => {
    api.ref
      .locations()
      .then(setLocations)
      .catch(() => undefined)
  }, [])

  const captureSecond = useCallback(
    async (weight: number, manual: boolean, source: WeightSample | null): Promise<void> => {
      const current = ticketRef.current
      if (!current) return
      const vrac = form.isVrac
      if (
        requiresBlForSecondWeigh(type, form.isRetour, vrac) &&
        (!form.blNo.trim() || pendingBlReference !== null)
      ) {
        setError(t('guide.block.needBl'))
        return
      }
      const clean = cleanLines(lines)
      if (vrac) {
        if (form.vracProduct.trim() === '') {
          setError(t('vrac.needProduct'))
          return
        }
      } else {
        if (hasIncompleteLine(lines)) {
          setError(t('lines.incomplete'))
          return
        }
        if (clean.length === 0) {
          setError(t('bal2.needLines'))
          return
        }
      }
      setBusy(true)
      setError(null)
      try {
        // Les informations saisies partent avec la pesée : pas d'étape
        // « enregistrer » à oublier avant de peser.
        await call(api.ops.update(current.id, infoPatch(form, type)))
        const updated = await call(
          api.ops.capture({
            operationId: current.id,
            weight,
            isManual: manual,
            stableMs: source?.stableMs ?? null,
            raw: source?.raw ? source.raw.slice(-255) : manual && !source ? 'MANUEL' : null,
            lines: vrac ? undefined : clean,
            vracProduct: vrac ? form.vracProduct.trim() : null
          })
        )
        ticketRef.current = updated
        setSelected(updated)
        notifyTicketsChanged()
      } catch (err) {
        const message = errorMessage(err)
        setError(message === 'BL_REQUIRED' ? t('guide.block.needBl') : message)
      } finally {
        setBusy(false)
      }
    },
    [lines, form, type, t, pendingBlReference]
  )

  /** La 1re pesée est refaite : nouveau poids ; l'ancienne reste tracée côté base. */
  const redoFirstNow = useCallback(
    async (weight: number, manual: boolean, source: WeightSample | null): Promise<void> => {
      const current = ticketRef.current
      if (!current?.first) return
      setBusy(true)
      setError(null)
      try {
        const updated = await call(
          api.ops.redoFirst({
            operationId: current.id,
            weight,
            isManual: manual,
            stableMs: source?.stableMs ?? null,
            raw: source?.raw ? source.raw.slice(-255) : manual && !source ? 'MANUEL' : null
          })
        )
        ticketRef.current = updated
        setSelected(updated)
        setRedo(false)
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        setBusy(false)
      }
    },
    []
  )

  const balance = useBalance(setError)

  function startRedo(): void {
    setRedo(true)
    setError(null)
  }

  function stopRedo(): void {
    setRedo(false)
  }

  // Changer de menu change de type : revenir à la liste des tickets en attente.
  useEffect(() => {
    ticketRef.current = null
    setSelected(null)
    setLines([])
    setForm(EMPTY_FORM)
    setLoadedBl(null)
    setManualProducts(false)
    setPendingBlReference(null)
    setShowNote(false)
    setError(null)
  }, [type])

  // Arrivée depuis la 1re balance (« ouvrir et continuer ce ticket »).
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current || !pendingTicket || pendingTicket.type !== type) return
    resumed.current = true
    choose(pendingTicket)
  }, [pendingTicket, type])

  function choose(op: Operation): void {
    stopRedo()
    ticketRef.current = op
    setSelected(op)
    setForm({
      isRetour: op.isRetour,
      isVrac: op.isVrac,
      vracProduct: op.isVrac ? (op.lines[0]?.productCode ?? '') : '',
      partnerName: op.partnerName ?? '',
      blNo: op.blNo ?? '',
      blDate: op.blDate ?? '',
      locationFromId: op.locationFromId == null ? '' : String(op.locationFromId),
      locationToId: op.locationToId == null ? '' : String(op.locationToId),
      notes: op.notes ?? ''
    })
    setShowNote(false)
    // Au moins une ligne prête à remplir : le produit est la première chose à saisir ici.
    const normalSortie = requiresBlForSecondWeigh(type, op.isRetour, op.isVrac)
    setLines(
      normalSortie
        ? []
        : op.lines.length > 0
          ? op.lines.map((l) => ({ ...l }))
          : [{ productCode: '', quantityKg: 0 }]
    )
    setBlNotice(null)
    setLoadedBl(null)
    setManualProducts(false)
    setPendingBlReference(null)
    setConfirmSave(false)
    setError(null)
    if (normalSortie && op.blNo) void loadBl(op.blNo)
  }

  function back(): void {
    stopRedo()
    list.setSearch('')
    ticketRef.current = null
    setSelected(null)
    setLines([])
    setForm(EMPTY_FORM)
    setLoadedBl(null)
    setManualProducts(false)
    setPendingBlReference(null)
    setShowNote(false)
    void list.reload()
  }

  /** La 2e pesée faite ne suffit pas : c'est cette confirmation qui enregistre. */
  async function saveTicket(): Promise<void> {
    const current = ticketRef.current
    if (!current) return
    setBusy(true)
    setError(null)
    try {
      const closed = await call(api.ops.close(current.id))
      ticketRef.current = closed
      setSelected(closed)
      setConfirmSave(false)
      notifyTicketsChanged()
      await list.reload()
    } catch (err) {
      setError(errorMessage(err))
      setConfirmSave(false)
    } finally {
      setBusy(false)
    }
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

  /** Remplit les produits et la date depuis le BL HFSQL. */
  async function loadBl(referenceInput = form.blNo): Promise<void> {
    const reference = referenceInput.trim()
    if (reference === '') return
    const normalSortie = requiresBlForSecondWeigh(type, form.isRetour, form.isVrac)
    setBlBusy(true)
    setBlNotice(null)
    if (normalSortie) {
      setLoadedBl(null)
      setLines([])
      setManualProducts(false)
      setForm((current) => ({ ...current, blNo: reference, blDate: '', partnerName: '' }))
    }
    try {
      const lookup = await call(api.bl.lookup(reference))
      setLoadedBl(normalSortie ? lookup : null)
      setForm((f) => ({
        ...f,
        blNo: lookup.reference,
        blDate: lookup.date ?? f.blDate,
        partnerName: normalSortie ? (lookup.clientName ?? '') : (f.partnerName || lookup.clientName || '')
      }))
      if (lookup.lines.length === 0) {
        setBlNotice({ kind: 'warn', text: t('bal2.blNoLines') })
        if (normalSortie) setManualProducts(true)
        return
      }
      setLines(
        lookup.lines.map((line) => ({
          productCode: line.code?.trim() || line.name?.trim() || t('bal2.blUnknownProduct'),
          quantityKg: line.weightKg ?? 0
        }))
      )
      setBlNotice(
        lookup.weightComplete
          ? {
              kind: 'ok',
              text: t('bal2.blLoaded', {
                count: lookup.lines.length,
                weight: formatKg(lookup.totalWeightKg, lang)
              })
            }
          : {
              kind: 'warn',
              text: t('bal2.blWeightMissing', { count: lookup.unknownWeightLines })
            }
      )
    } catch (err) {
      const message = errorMessage(err)
      const canUsePaper = /Aucun BL trouvé|HFSQL.*injoignable|API BL injoignable|\b(404|503)\b/i.test(
        message
      )
      if (normalSortie) {
        setLoadedBl(null)
        setLines([])
        setManualProducts(canUsePaper)
      }
      setBlNotice({
        kind: 'warn',
        text: !normalSortie
          ? message
          : /plusieurs années/i.test(message)
            ? t('bal2.blLookupAmbiguous')
            : canUsePaper
              ? t('bal2.blLookupFailed')
              : t('bal2.blLookupError')
      })
    } finally {
      setBlBusy(false)
    }
  }

  function requestBlChangeConfirmation(reference: string): boolean {
    if (!loadedBl || reference.trim() === loadedBl.reference) return false
    setPendingBlReference(reference)
    return true
  }

  async function confirmBlChange(): Promise<void> {
    const reference = pendingBlReference?.trim() ?? ''
    setPendingBlReference(null)
    setLoadedBl(null)
    setLines([])
    setManualProducts(false)
    setBlNotice(null)
    setForm((current) => ({ ...current, blNo: reference, blDate: '', partnerName: '' }))
    if (reference !== '') await loadBl(reference)
  }

  async function captureNow(request: CaptureRequest): Promise<void> {
    if (!selected?.first) return
    const source = request.manual ? null : balance.sample
    if (redo) await redoFirstNow(request.weight, request.manual, source)
    else await captureSecond(request.weight, request.manual, source)
  }

  const complete = selected?.second != null
  const closed = selected != null && selected.status !== 'OUVERTE'
  const incomplete = hasIncompleteLine(lines)
  const normalSortie = requiresBlForSecondWeigh(type, form.isRetour, form.isVrac)
  const block: FormBlock | null = redo
    ? null
    : normalSortie &&
        (form.blNo.trim() === '' ||
          pendingBlReference !== null ||
          (loadedBl !== null && form.blNo.trim() !== loadedBl.reference))
      ? 'needBl'
    : form.isVrac
      ? form.vracProduct.trim() === ''
        ? 'needVracProduct'
        : null
      : incomplete
        ? 'incompleteLines'
        : cleanLines(lines).length === 0
          ? 'needLines'
          : null

  const rows = list.data?.rows ?? []
  const shownError = error ?? list.error

  const errorBanner = shownError && (
    <Guide
      tone="error"
      title={t('common.error')}
      onDismiss={error ? () => setError(null) : undefined}
    >
      {shownError}
    </Guide>
  )

  // ——— 1. Choisir le camion ———
  if (!selected) {
    return (
      <div className="station">
        {errorBanner}
        <div className="work">
          <section className="panel list-panel" aria-labelledby="b2-list-title">
            <h2 id="b2-list-title">{t('b2.listTitle')}</h2>
            <p className="lead">
              <Icon name="info" size={22} />
              {t('b2.listGuide')}
            </p>

            <TicketFilters
              autoFocus
              search={list.search}
              onSearch={list.setSearch}
              placeholder={t('bal2.search')}
              dateFrom={list.dateFrom}
              dateTo={list.dateTo}
              onDateFrom={list.setDateFrom}
              onDateTo={list.setDateTo}
            />

            {rows.length > 0 && (
              <ul className="truck-list">
                {rows.map((op) => (
                  <li key={op.id}>
                    <button type="button" className="truck-row" onClick={() => choose(op)}>
                      <span className="plate" dir="ltr">
                        {op.plate || '—'}
                      </span>
                      <span className="truck-row-info">
                        <strong>{op.driverName || '—'}</strong>
                        <small>
                          {op.ticketNo} · {formatDateTime(op.createdAt)}
                          {op.isRetour && (
                            <span className="chip chip-retour">{t('station.retour')}</span>
                          )}
                          {op.isVrac && <span className="chip chip-warn">{t('station.vrac')}</span>}
                        </small>
                      </span>
                      <span className="truck-row-weight">
                        <small>{t('station.firstWeigh')}</small>
                        <strong className="digits" dir="ltr">
                          {formatKg(op.first?.weight, lang)}
                        </strong>
                        {op.first?.isManual && <ManualMark />}
                      </span>
                      <span className="truck-row-go">
                        {t('bal2.choose')}
                        <Icon name="chevron" size={22} className="icon-flip" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {rows.length === 0 && !list.loading && (
              <div className="empty">
                <Icon name="truck" size={44} />
                <p>{list.filtered ? t('bal2.noMatch') : t('bal2.none')}</p>
              </div>
            )}

            {list.data && (
              <Pagination
                page={list.data.page}
                pages={list.data.pages}
                total={list.data.total}
                pageSize={list.data.pageSize}
                loading={list.loading}
                onPage={list.setPage}
                onPageSize={list.setPageSize}
              />
            )}
          </section>

          <aside className="side">
            <JourneyCard step={3} />
          </aside>
        </div>
      </div>
    )
  }

  // ——— 2. Compléter et peser ———
  return (
    <div className="station">
      <WeightConsole
        sample={balance.sample}
        running={balance.running}
        simulated={balance.simulated}
        busy={busy}
        onStart={() => void balance.startBalance()}
      />

      {errorBanner}

      <div className="work">
        {!complete && (
          <section className="panel form-panel" aria-labelledby="b2-form-title">
            <h2 id="b2-form-title" className="sr-only">
              {t('bal2.complete')}
            </h2>
            {redo && (
              <Guide tone="warn">
                {t('bal.redoHint', { weight: formatKg(selected.first?.weight, lang) })}
              </Guide>
            )}
            <div className="panel-toolbar">
              {!redo && (
                <p className="lead">
                  <Icon name="info" size={22} />
                  {t('b2.formGuide')}
                </p>
              )}
              <div className="toolbar-actions">
                {!redo && (
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
                <button type="button" className="btn btn-secondary btn-sm" onClick={back}>
                  <Icon name="arrow-left" size={18} className="icon-flip" />
                  {t('truck.change')}
                </button>
              </div>
            </div>

            <div className="form-col">
              {normalSortie && (
                <Field label={t('station.blNo')} hint={t('bal2.blFirstHint')}>
                  <span className="field-action bl-first-action">
                    <input
                      className="bl-first-input"
                      autoFocus
                      autoComplete="off"
                      dir="ltr"
                      value={form.blNo}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, blNo: event.target.value }))
                      }
                      onBlur={(event) => {
                        requestBlChangeConfirmation(event.currentTarget.value)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          if (!requestBlChangeConfirmation(form.blNo)) void loadBl()
                        }
                      }}
                      disabled={busy || blBusy}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-lg"
                      disabled={busy || blBusy || form.blNo.trim() === ''}
                      onClick={() => {
                        if (!requestBlChangeConfirmation(form.blNo)) void loadBl()
                      }}
                    >
                      <Icon name="in" size={20} />
                      {t('bal2.blLoad')}
                    </button>
                  </span>
                </Field>
              )}

              {form.isVrac ? (
                <>
                  <Guide tone="info">{t('station.vrac.hint')}</Guide>
                  <Field label={t('vrac.product')} hint={t('vrac.productHint')}>
                    <ArticlePicker
                      ariaLabel={t('vrac.product')}
                      value={form.vracProduct}
                      group={articleGroupForOperation(type, form.isRetour)}
                      onChange={(vracProduct) => setForm({ ...form, vracProduct })}
                      disabled={busy}
                    />
                  </Field>
                </>
              ) : normalSortie ? (
                <>
                  {loadedBl && (
                    <section className="bl-readonly" aria-label={t('bal2.blReference', { reference: loadedBl.reference })}>
                      <div className="bl-summary">
                        <strong dir="ltr">{t('bal2.blReference', { reference: loadedBl.reference })}</strong>
                        {loadedBl.date && (
                          <span dir="ltr">{t('station.blDate')}: {loadedBl.date}</span>
                        )}
                      </div>
                      {loadedBl.lines.length > 0 && (
                        <div className="bl-table-wrap">
                          <table className="bl-table">
                            <thead>
                              <tr>
                                <th>{t('bal2.blCode')}</th>
                                <th>{t('bal2.blProduct')}</th>
                                <th>{t('bal2.blQuantity')}</th>
                                <th>{t('bal2.blWeight')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {loadedBl.lines.map((line, index) => (
                                <tr key={`${line.code ?? 'line'}-${index}`}>
                                  <td dir="ltr"><span className="bl-code">{line.code || '—'}</span></td>
                                  <td>{line.name || '—'}</td>
                                  <td dir="ltr">
                                    {line.quantity == null
                                      ? '—'
                                      : line.quantity.toLocaleString(lang === 'ar' ? 'ar-DZ' : 'fr-FR', { maximumFractionDigits: 3 })}
                                  </td>
                                  <td dir="ltr">{formatKg(line.weightKg, lang)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="bl-total">
                        {loadedBl.weightComplete
                          ? <>{t('bal2.blTotal')}: <strong dir="ltr">{formatKg(loadedBl.totalWeightKg, lang)}</strong></>
                          : t('bal2.blWeightMissing', { count: loadedBl.unknownWeightLines })}
                      </p>
                    </section>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary manual-products-toggle"
                    aria-expanded={manualProducts}
                    disabled={busy}
                    onClick={() => setManualProducts((current) => !current)}
                  >
                    <Icon name={manualProducts ? 'check' : 'edit'} size={20} />
                    {t('bal2.manualProducts')}
                  </button>
                  {manualProducts && (
                    <>
                      <p className="field-hint">{t('bal2.manualProductsHint')}</p>
                      <Field label={t('station.blDate')} optional>
                        <input
                          type="date"
                          dir="ltr"
                          value={form.blDate}
                          disabled={busy}
                          onChange={(event) => setForm((current) => ({ ...current, blDate: event.target.value }))}
                        />
                      </Field>
                      <ProductLines
                        lines={lines.length > 0 ? lines : [{ productCode: '', quantityKg: 0 }]}
                        onChange={setLines}
                        disabled={busy}
                        group={articleGroupForOperation(type, form.isRetour)}
                      />
                    </>
                  )}
                </>
              ) : (
                <ProductLines
                  lines={lines}
                  onChange={setLines}
                  disabled={busy}
                  group={articleGroupForOperation(type, form.isRetour)}
                />
              )}

              <div className="pair">
                <Field label={t('station.partner')} optional>
                  <input
                    autoComplete="off"
                    value={form.partnerName}
                    onChange={(e) => setForm({ ...form, partnerName: e.target.value })}
                  />
                </Field>
                {allowsBl(type, form.isRetour) && !form.isVrac && !normalSortie && (
                  <Field label={t('station.blNo')} optional>
                    <span className="field-action">
                      <input
                        autoComplete="off"
                        dir="ltr"
                        value={form.blNo}
                        onChange={(e) => setForm({ ...form, blNo: e.target.value })}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busy || blBusy || form.blNo.trim() === ''}
                        onClick={() => void loadBl()}
                      >
                        <Icon name="in" size={18} />
                        {t('bal2.blLoad')}
                      </button>
                    </span>
                  </Field>
                )}
              </div>

              {blNotice && (
                <Guide tone={blNotice.kind} onDismiss={() => setBlNotice(null)}>
                  {blNotice.text}
                </Guide>
              )}

              <RetourToggle
                type={type}
                checked={form.isRetour}
                onChange={(value) =>
                  setForm({ ...form, isRetour: value, isVrac: value ? false : form.isVrac })
                }
                disabled={busy}
              />

              <VracToggle
                type={type}
                isRetour={form.isRetour}
                checked={form.isVrac}
                onChange={(value) =>
                  setForm({
                    ...form,
                    isVrac: value,
                    vracProduct:
                      value && form.vracProduct === ''
                        ? (lines[0]?.productCode ?? '')
                        : form.vracProduct,
                  })
                }
                disabled={busy}
              />

              <LocationPickers
                type={type}
                isRetour={form.isRetour}
                locations={locations}
                from={form.locationFromId}
                to={form.locationToId}
                onFrom={(value) => setForm({ ...form, locationFromId: value })}
                onTo={(value) => setForm({ ...form, locationToId: value })}
                disabled={busy}
              />

              {showNote || form.notes !== '' ? (
                <Field label={t('station.notes')} optional>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </Field>
              ) : (
                <button type="button" className="btn btn-link" onClick={() => setShowNote(true)}>
                  <Icon name="plus" size={20} />
                  {t('form.addNote')}
                </button>
              )}
            </div>
          </section>
        )}

        {complete && (
          <section className="panel result-panel" aria-labelledby="b2-result">
            <div className="result-hero">
              <Icon name="check-circle" size={52} />
              <div>
                <h2 id="b2-result">{closed ? t('b2.closedTitle') : t('b2.doneTitle')}</h2>
                <p>
                  <span className="ticket-no">{selected.ticketNo}</span>{' '}
                  <StatusChip op={selected} />
                  {selected.isVrac && <span className="chip chip-warn">{t('station.vrac')}</span>}
                </p>
                <p
                  className={`hero-note${selected.ecartOk === false && !closed ? ' is-warn' : ''}`}
                >
                  {closed
                    ? t('b2.closedGuide')
                    : selected.ecartOk === false
                      ? t('b2.ecartWarn')
                      : t('b2.checkGuide')}
                </p>
              </div>
            </div>

            <div className="totals">
              <div
                className={`total-net${
                  selected.ecartOk === false ? ' is-ko' : selected.ecartOk === true ? ' is-ok' : ''
                }`}
              >
                <span>{t('station.net')}</span>
                <strong className="digits" dir="ltr">
                  {formatKg(selected.netWeight, lang)}
                </strong>
                {selected.ecartOk != null && (
                  <span className={`chip ${selected.ecartOk ? 'chip-done' : 'chip-warn'}`}>
                    <Icon name={selected.ecartOk ? 'check' : 'alert'} size={16} />
                    {selected.ecartOk ? t('station.ecartOk') : t('station.ecartKo')}
                  </span>
                )}
              </div>
              <dl className="total-grid">
                <div>
                  <dt>{t('station.gross')}</dt>
                  <dd dir="ltr">
                    {formatKg(selected.grossWeight, lang)}
                    {isManualKind(selected, 'BRUT') && <ManualMark />}
                  </dd>
                </div>
                <div>
                  <dt>{t('station.tare')}</dt>
                  <dd dir="ltr">
                    {formatKg(selected.tareWeight, lang)}
                    {isManualKind(selected, 'TARE') && <ManualMark />}
                  </dd>
                </div>
                {!selected.isVrac && (
                  <>
                    <div>
                      <dt>{t('result.supposed')}</dt>
                      <dd dir="ltr">{formatKg(selected.weightSupposed, lang)}</dd>
                    </div>
                    <div>
                      <dt>{t('station.ecart')}</dt>
                      <dd dir="ltr">{formatKg(selected.ecart, lang)}</dd>
                    </div>
                  </>
                )}
              </dl>
            </div>

            {selected.isVrac && (
              <Guide tone="ok" title={t('station.vrac')}>
                {vracGroup
                  ? t('vracGroup.current', {
                      ref: vracGroup.reference,
                      count: vracGroup.weighedCount,
                      total: formatKg(vracGroup.totalNetKg, lang)
                    })
                  : t('vrac.handover')}
              </Guide>
            )}

            <div className="weighings">
              <div>
                <span>{t('station.firstWeigh')}</span>
                <strong className="digits" dir="ltr">
                  {formatKg(selected.first?.weight, lang)}
                </strong>
                {selected.first?.isManual && <ManualMark />}
                <small>{selected.first ? formatDateTime(selected.first.at) : '—'}</small>
              </div>
              <div>
                <span>{t('station.secondWeigh')}</span>
                <strong className="digits" dir="ltr">
                  {formatKg(selected.second?.weight, lang)}
                </strong>
                {selected.second?.isManual && <ManualMark />}
                <small>{selected.second ? formatDateTime(selected.second.at) : '—'}</small>
              </div>
            </div>

            {selected.lines.length > 0 && (
              <div className="lines-readonly">
                <h3>{t('lines.title')}</h3>
                {selected.lines.map((line, index) => (
                  <div className="lines-readonly-row" key={index}>
                    <span>{line.productCode}</span>
                    <strong className="digits">{formatKg(line.quantityKg, lang)}</strong>
                  </div>
                ))}
              </div>
            )}

            <div className="result-actions">
              {!closed ? (
                <button
                  type="button"
                  className="btn btn-primary btn-xl"
                  disabled={busy}
                  onClick={() => setConfirmSave(true)}
                >
                  <Icon name="check-circle" size={30} />
                  {t('station.save')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-xl"
                    disabled={busy}
                    onClick={() => void printTicket(selected.id)}
                  >
                    <Icon name="printer" size={30} />
                    {t('station.print')}
                  </button>
                  <button type="button" className="btn btn-secondary btn-xl" onClick={back}>
                    <Icon name="truck" size={30} />
                    {t('b2.next')}
                  </button>
                </>
              )}
              <span className="result-more">
                {!closed && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => void printTicket(selected.id)}
                  >
                    <Icon name="printer" size={18} />
                    {t('station.print')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => void openPreview(selected.id)}
                >
                  <Icon name="eye" size={18} />
                  {t('station.preview')}
                </button>
                {!closed && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={back}>
                    <Icon name="arrow-left" size={18} className="icon-flip" />
                    {t('bal2.back')}
                  </button>
                )}
              </span>
            </div>
          </section>
        )}

        <aside className="side">
          <TruckCard op={selected} />
          <JourneyCard step={closed ? 5 : complete ? 4 : 3} />
        </aside>
      </div>

      {!complete && (
        <CaptureBar
          key={`${selected?.id ?? 'none'}-${redo ? 'redo' : 'second'}`}
          label={redo ? t('bal.redoCapture') : t('capture.second')}
          sample={balance.sample}
          running={balance.running}
          busy={busy || blBusy}
          block={block}
          onCapture={(request) => void captureNow(request)}
          onCancel={redo ? stopRedo : undefined}
          cancelLabel={t('capture.cancelRedo')}
        />
      )}

      {balance.simulated && <SimulatorPanel />}

      <ConfirmDialog
        open={confirmSave}
        busy={busy}
        icon="check-circle"
        title={t('station.confirmSave', { ticket: selected.ticketNo })}
        confirmLabel={t('station.save')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirmSave(false)}
        onConfirm={() => void saveTicket()}
      >
        <p>{t('b2.confirmBody')}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingBlReference !== null}
        title={t('bal2.blChangeTitle')}
        confirmLabel={t('bal2.blChangeConfirm')}
        onCancel={() => {
          setPendingBlReference(null)
          if (loadedBl) setForm((current) => ({ ...current, blNo: loadedBl.reference }))
        }}
        onConfirm={() => void confirmBlChange()}
      >
        <p>{t('bal2.blChangeBody')}</p>
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

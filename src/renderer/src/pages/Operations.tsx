import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Location, OpUpdate } from '@shared/channels'
import { asksFrom, asksTo, locationFieldsFor } from '@shared/domain/locations'
import { allowsBl } from '@shared/domain/operation-fields'
import { ticketStage } from '@shared/domain/ticket-stage'
import { compareBlToNet, isBlPending } from '@shared/domain/vrac'
import { isManualKind } from '@shared/domain/weighing'
import type { Operation, OperationStatus, OperationType } from '@shared/types'
import { api, call, errorMessage, formatDateTime, formatKg, notifyTicketsChanged } from '../api'
import ConfirmDialog from '../components/ConfirmDialog'
import Dialog from '../components/Dialog'
import Field from '../components/Field'
import Guide from '../components/Guide'
import Icon from '../components/Icon'
import LocationPickers from '../components/LocationPickers'
import ManualMark from '../components/ManualMark'
import Pagination from '../components/Pagination'
import RetourToggle from '../components/RetourToggle'
import Segmented from '../components/Segmented'
import StatusChip from '../components/StatusChip'
import TicketFilters from '../components/TicketFilters'
import TicketPreview from '../components/TicketPreview'
import VracToggle from '../components/VracToggle'
import { useTicketPage } from '../hooks/useTicketPage'
import { useI18n } from '../i18n'
import { operationPath } from '../navigation'

interface EditDraft {
  isRetour: boolean
  isVrac: boolean
  plate: string
  driverName: string
  partnerName: string
  blNo: string
  blDate: string
  locationFromId: string
  locationToId: string
  notes: string
}

function toDraft(op: Operation): EditDraft {
  return {
    isRetour: op.isRetour,
    isVrac: op.isVrac,
    plate: op.plate ?? '',
    driverName: op.driverName ?? '',
    partnerName: op.partnerName ?? '',
    blNo: op.blNo ?? '',
    blDate: op.blDate ?? '',
    locationFromId: op.locationFromId == null ? '' : String(op.locationFromId),
    locationToId: op.locationToId == null ? '' : String(op.locationToId),
    notes: op.notes ?? ''
  }
}

/** Produits d'une ligne de tableau : les deux premiers, puis « +n ». */
function productsSummary(op: Operation): string {
  if (op.lines.length === 0) return '—'
  const shown = op.lines.slice(0, 2).map((l) => l.productCode)
  const more = op.lines.length - shown.length
  return more > 0 ? `${shown.join(', ')} +${more}` : shown.join(', ')
}

/**
 * Tickets d'un type de pesée : consultation, correction des champs descriptifs,
 * enregistrement d'un ticket resté ouvert, réimpression, annulation.
 *
 * La liste ne montre que l'essentiel ; tout le reste (pesées, produits, actions)
 * s'ouvre dans la fiche du ticket, pour que chaque ligne n'ait qu'un bouton.
 *
 * Les poids ne sont pas modifiables ici (ils viennent des pesées enregistrées) et
 * les produits se complètent à la 2e balance, où le total supposé se calcule.
 */
export default function Operations({ type }: { type: OperationType }) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [status, setStatus] = useState<OperationStatus | null>(null)
  const [blPendingOnly, setBlPendingOnly] = useState(false)
  const [locations, setLocations] = useState<Location[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Operation | null>(null)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [confirmSave, setConfirmSave] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [blBusy, setBlBusy] = useState(false)
  const [blNotice, setBlNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)
  const [preview, setPreview] = useState<{ id: number; html: string } | null>(null)

  // Liste paginée côté serveur : seule la page affichée est chargée.
  const list = useTicketPage({ type, status, blPending: blPendingOnly })
  const reload = list.reload
  const rows = list.data?.rows ?? []

  useEffect(() => {
    api.ref
      .locations()
      .then(setLocations)
      .catch(() => undefined)
  }, [])

  function closeDetail(): void {
    setSelected(null)
    setDraft(null)
    setCancelling(false)
    setConfirmSave(false)
    setReason('')
    setBlNotice(null)
  }

  async function confirmCancel(op: Operation): Promise<void> {
    setBusy(true)
    try {
      await call(api.ops.cancel(op.id, reason))
      closeDetail()
      notifyTicketsChanged()
      await reload()
    } catch (err) {
      setError(errorMessage(err))
      setCancelling(false)
    } finally {
      setBusy(false)
    }
  }

  async function closeTicket(op: Operation): Promise<void> {
    setBusy(true)
    try {
      const closed = await call(api.ops.close(op.id))
      setSelected(closed)
      setConfirmSave(false)
      notifyTicketsChanged()
      await reload()
    } catch (err) {
      setError(errorMessage(err))
      setConfirmSave(false)
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(op: Operation): Promise<void> {
    if (!draft) return
    setBusy(true)
    try {
      const patch: OpUpdate = {
        isRetour: draft.isRetour,
        isVrac: draft.isVrac,
        plate: draft.plate || null,
        driverName: draft.driverName || null,
        partnerName: draft.partnerName || null,
        blNo: allowsBl(type, draft.isRetour) ? draft.blNo || null : null,
        blDate: draft.blDate || null,
        notes: draft.notes || null
      }
      // Seuls les lieux demandés pour ce type sont envoyés (le serveur fixe les autres).
      const fields = locationFieldsFor(type, draft.isRetour)
      if (asksFrom(fields)) {
        patch.locationFromId = draft.locationFromId === '' ? null : Number(draft.locationFromId)
      }
      if (asksTo(fields)) {
        patch.locationToId = draft.locationToId === '' ? null : Number(draft.locationToId)
      }
      const updated = await call(api.ops.update(op.id, patch))
      setSelected(updated)
      setDraft(null)
      await reload()
    } catch (err) {
      setError(errorMessage(err))
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

  /** Compare le BL HFSQL au net pesé : informatif, la correction reste manuelle. */
  async function checkBl(): Promise<void> {
    if (!draft || !selected) return
    const reference = draft.blNo.trim()
    if (reference === '') return
    setBlBusy(true)
    setBlNotice(null)
    try {
      const lookup = await call(api.bl.lookup(reference))
      const check = compareBlToNet(lookup.totalWeightKg, selected.netWeight)
      if (check.kind === 'unknown') {
        setBlNotice({
          kind: 'warn',
          text: t('ops.blCheck.unknown', { reference: lookup.reference })
        })
        return
      }
      setBlNotice({
        kind: check.kind === 'match' ? 'ok' : 'warn',
        text: t(check.kind === 'match' ? 'ops.blCheck.match' : 'ops.blCheck.differs', {
          reference: lookup.reference,
          bl: formatKg(check.blWeightKg, lang),
          net: formatKg(check.netKg, lang),
          diff: formatKg(check.diffKg, lang)
        })
      })
    } catch (err) {
      setBlNotice({ kind: 'warn', text: errorMessage(err) })
    } finally {
      setBlBusy(false)
    }
  }

  const setField =
    (key: Exclude<keyof EditDraft, 'isRetour'>) => (e: { target: { value: string } }) =>
      setDraft((current) => (current ? { ...current, [key]: e.target.value } : current))

  const shownError = error ?? list.error
  const stage = selected ? ticketStage(selected) : null

  return (
    <div className="station">
      <section className="panel table-panel" aria-labelledby="tickets-title">
        <header className="panel-head">
          <h2 id="tickets-title">{`${t('ops.title')} — ${t(`station.type.${type}`)}`}</h2>
          <Segmented
            label={t('ops.title')}
            value={status ?? 'ALL'}
            onChange={(value) => setStatus(value === 'ALL' ? null : value)}
            options={[
              { value: 'ALL', label: t('common.all') },
              { value: 'OUVERTE', label: t('ops.f.OUVERTE') },
              { value: 'FERMEE', label: t('ops.f.FERMEE') },
              { value: 'ANNULEE', label: t('ops.f.ANNULEE') }
            ]}
          />
        </header>

        <TicketFilters
          search={list.search}
          onSearch={list.setSearch}
          placeholder={t('bal2.search')}
          dateFrom={list.dateFrom}
          dateTo={list.dateTo}
          onDateFrom={list.setDateFrom}
          onDateTo={list.setDateTo}
        >
          {type === 'SORTIE' && (
            <label className="inline-check">
              <input
                type="checkbox"
                checked={blPendingOnly}
                onChange={(e) => setBlPendingOnly(e.target.checked)}
              />
              <span>{t('ops.blPendingOnly')}</span>
            </label>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => void reload()}>
            <Icon name="refresh" size={20} />
            {t('common.refresh')}
          </button>
        </TicketFilters>

        {shownError && (
          <Guide
            tone="error"
            title={t('common.error')}
            onDismiss={error ? () => setError(null) : undefined}
          >
            {shownError}
          </Guide>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('station.ticket')}</th>
                <th>{t('ops.date')}</th>
                <th>{t('station.plate')}</th>
                <th>{t('ops.products')}</th>
                <th className="num">{t('station.net')}</th>
                <th>{t('ops.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.status === 'ANNULEE' ? 'is-cancelled' : undefined}>
                  <td>
                    <span className="ticket-no">{row.ticketNo}</span>
                    {row.isRetour && (
                      <span className="chip chip-retour">{t('station.retour')}</span>
                    )}
                    {row.isVrac && <span className="chip chip-warn">{t('station.vrac')}</span>}
                    {isBlPending(row) && (
                      <span className="chip chip-waiting">
                        <Icon name="alert" size={16} />
                        {t('ops.blPending')}
                      </span>
                    )}
                  </td>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>
                    <span className="plate plate-sm" dir="ltr">
                      {row.plate || '—'}
                    </span>
                  </td>
                  <td>{productsSummary(row)}</td>
                  <td className="num">
                    <strong className="digits" dir="ltr">
                      {formatKg(row.netWeight, lang)}
                    </strong>
                  </td>
                  <td>
                    <StatusChip op={row} />
                    {row.ecartOk === false && (
                      <span className="chip chip-warn">
                        <Icon name="alert" size={16} />
                        {t('station.ecartKo')}
                      </span>
                    )}
                  </td>
                  <td className="actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setSelected(row)}
                    >
                      {t('ops.open')}
                      <Icon name="chevron" size={18} className="icon-flip" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows.length === 0 && !list.loading && (
            <div className="empty">
              <Icon name="list" size={44} />
              <p>{list.filtered ? t('bal2.noMatch') : t('ops.empty')}</p>
              {!list.filtered && <small>{t('ops.emptyHint')}</small>}
            </div>
          )}
        </div>

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

      {/* ——— Fiche du ticket ——— */}
      <Dialog
        open={selected != null}
        onClose={closeDetail}
        size="lg"
        title={selected ? `${t('station.ticket')} ${selected.ticketNo}` : ''}
        footer={
          selected &&
          (draft ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                disabled={busy}
                onClick={() => void saveEdit(selected)}
              >
                <Icon name="check" />
                {t('common.save')}
              </button>
            </>
          ) : (
            <>
              {stage !== 'cancelled' && (
                <button
                  type="button"
                  className="btn btn-danger-soft"
                  onClick={() => setCancelling(true)}
                >
                  <Icon name="trash" size={20} />
                  {t('ops.cancelTicket')}
                </button>
              )}
              <span className="spacer" />
              {stage !== 'cancelled' && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => void openPreview(selected.id)}
                  >
                    <Icon name="eye" size={20} />
                    {t('ops.preview')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => void printTicket(selected.id)}
                  >
                    <Icon name="printer" size={20} />
                    {t('ops.print')}
                  </button>
                </>
              )}
              {stage === 'waiting' && (
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  onClick={() =>
                    navigate(`${operationPath(type)}/balance-2`, {
                      state: { pendingTicket: selected }
                    })
                  }
                >
                  <Icon name="scale" size={20} />
                  {t('ops.continueWeighing')}
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDraft(toDraft(selected))}
              >
                <Icon name="edit" size={20} />
                {t('ops.edit')}
              </button>
              {stage === 'toSave' && (
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  disabled={busy}
                  onClick={() => setConfirmSave(true)}
                >
                  <Icon name="check-circle" />
                  {t('station.save')}
                </button>
              )}
            </>
          ))
        }
      >
        {selected && !draft && (
          <div className="detail">
            <div className="detail-top">
              <StatusChip op={selected} />
              {selected.isRetour && <span className="chip chip-retour">{t('station.retour')}</span>}
              {selected.isVrac && <span className="chip chip-warn">{t('station.vrac')}</span>}
              {isBlPending(selected) && (
                <span className="chip chip-waiting">
                  <Icon name="alert" size={16} />
                  {t('ops.blPending')}
                </span>
              )}
              <span className="plate" dir="ltr">
                {selected.plate || '—'}
              </span>
            </div>

            {selected.status === 'ANNULEE' && selected.cancelReason && (
              <Guide tone="warn">
                {t('ops.cancelledBecause', { reason: selected.cancelReason })}
              </Guide>
            )}

            <h3>{t('ops.weights')}</h3>
            <dl className="detail-grid">
              <div>
                <dt>{t('station.firstWeigh')}</dt>
                <dd dir="ltr">
                  <strong className="digits">{formatKg(selected.first?.weight, lang)}</strong>
                  {selected.first?.isManual && <ManualMark />}
                  <small>{selected.first ? formatDateTime(selected.first.at) : '—'}</small>
                </dd>
              </div>
              <div>
                <dt>{t('station.secondWeigh')}</dt>
                <dd dir="ltr">
                  <strong className="digits">{formatKg(selected.second?.weight, lang)}</strong>
                  {selected.second?.isManual && <ManualMark />}
                  <small>{selected.second ? formatDateTime(selected.second.at) : '—'}</small>
                </dd>
              </div>
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
              <div className="is-key">
                <dt>{t('station.net')}</dt>
                <dd dir="ltr">
                  <strong className="digits">{formatKg(selected.netWeight, lang)}</strong>
                </dd>
              </div>
              <div>
                <dt>{t('station.ecart')}</dt>
                <dd dir="ltr">
                  {formatKg(selected.ecart, lang)}
                  {selected.ecartOk != null && (
                    <span className={`chip ${selected.ecartOk ? 'chip-done' : 'chip-warn'}`}>
                      {selected.ecartOk ? t('station.ecartOk') : t('station.ecartKo')}
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            {selected.lines.length > 0 && (
              <>
                <h3>{t('lines.title')}</h3>
                <div className="lines-readonly">
                  {selected.lines.map((line, index) => (
                    <div className="lines-readonly-row" key={index}>
                      <span>{line.productCode}</span>
                      <strong className="digits">{formatKg(line.quantityKg, lang)}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}

            <h3>{t('ops.info')}</h3>
            <dl className="detail-grid">
              <div>
                <dt>{t('station.driver')}</dt>
                <dd>{selected.driverName || '—'}</dd>
              </div>
              <div>
                <dt>{t('station.partner')}</dt>
                <dd>{selected.partnerName || '—'}</dd>
              </div>
              <div>
                <dt>{t('station.blNo')}</dt>
                <dd dir="ltr">{selected.blNo || '—'}</dd>
              </div>
              <div>
                <dt>{t('ops.date')}</dt>
                <dd dir="ltr">{formatDateTime(selected.createdAt)}</dd>
              </div>
              {selected.notes && (
                <div className="is-wide">
                  <dt>{t('station.notes')}</dt>
                  <dd>{selected.notes}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {selected && draft && (
          <div className="form-col">
            <Guide>{t('ops.editTitle')}</Guide>
            <Field label={t('station.plate')}>
              <input dir="ltr" value={draft.plate} onChange={setField('plate')} />
            </Field>
            <Field label={t('station.driver')}>
              <input value={draft.driverName} onChange={setField('driverName')} />
            </Field>
            <Field label={t('station.partner')}>
              <input value={draft.partnerName} onChange={setField('partnerName')} />
            </Field>
            {allowsBl(type, draft.isRetour) && !draft.isVrac && (
              <Field label={t('station.blNo')}>
                <span className="field-action">
                  <input dir="ltr" value={draft.blNo} onChange={setField('blNo')} />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy || blBusy || draft.blNo.trim() === ''}
                    onClick={() => void checkBl()}
                  >
                    <Icon name="in" size={18} />
                    {t('ops.blCheck')}
                  </button>
                </span>
              </Field>
            )}
            {blNotice && (
              <Guide tone={blNotice.kind} onDismiss={() => setBlNotice(null)}>
                {blNotice.text}
              </Guide>
            )}
            <RetourToggle
              type={type}
              checked={draft.isRetour}
              onChange={(value) =>
                setDraft((current) =>
                  current
                    ? { ...current, isRetour: value, isVrac: value ? false : current.isVrac }
                    : current
                )
              }
            />
            <VracToggle
              type={type}
              isRetour={draft.isRetour}
              checked={draft.isVrac}
              disabled={selected.second != null}
              onChange={(value) =>
                setDraft((current) => (current ? { ...current, isVrac: value } : current))
              }
            />
            <LocationPickers
              type={type}
              isRetour={draft.isRetour}
              locations={locations}
              from={draft.locationFromId}
              to={draft.locationToId}
              onFrom={(value) =>
                setDraft((current) => (current ? { ...current, locationFromId: value } : current))
              }
              onTo={(value) =>
                setDraft((current) => (current ? { ...current, locationToId: value } : current))
              }
            />
            <Field label={t('station.notes')}>
              <textarea rows={2} value={draft.notes} onChange={setField('notes')} />
            </Field>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmSave && selected != null}
        busy={busy}
        icon="check-circle"
        title={t('station.confirmSave', { ticket: selected?.ticketNo ?? '' })}
        confirmLabel={t('station.save')}
        onCancel={() => setConfirmSave(false)}
        onConfirm={() => selected && void closeTicket(selected)}
      >
        <p>{t('b2.confirmBody')}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={cancelling && selected != null}
        danger
        icon="trash"
        busy={busy}
        confirmDisabled={reason.trim().length < 3}
        title={t('ops.cancelAsk', { ticket: selected?.ticketNo ?? '' })}
        confirmLabel={t('ops.cancelTicket')}
        cancelLabel={t('ops.keep')}
        onCancel={() => setCancelling(false)}
        onConfirm={() => selected && void confirmCancel(selected)}
      >
        <p>{t('ops.cancelWarn')}</p>
        <Field label={t('ops.cancelReason')}>
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
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

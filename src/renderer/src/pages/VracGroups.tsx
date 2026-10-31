import { useCallback, useEffect, useState } from 'react'
import { closeBlocker, compareBlToNet, isGroupBlPending } from '@shared/domain/vrac'
import type { VracGroup, VracGroupStatus } from '@shared/types'
import { api, call, errorMessage, formatDateTime, formatKg } from '../api'
import ConfirmDialog from '../components/ConfirmDialog'
import Guide from '../components/Guide'
import Icon from '../components/Icon'
import Segmented from '../components/Segmented'
import TicketPreview from '../components/TicketPreview'
import { useI18n } from '../i18n'

type StatusFilter = VracGroupStatus | 'ALL'

/** Ce que la dernière vérification a trouvé dans HFSQL pour le BL tapé. */
interface BlDraft {
  blNo: string
  blDate: string | null
  clientName: string | null
}

/**
 * Enlèvements vrac : un client prend son vrac en plusieurs rotations, chacune est
 * un ticket. L'enlèvement les additionne ; le commercial établit UN BL sur le total.
 *
 * Flux : on clôture quand le client a fini, on remet le récapitulatif au
 * commercial, puis on rattache son BL (vérifié dans HFSQL) à toutes les rotations.
 */
export default function VracGroups() {
  const { t, lang } = useI18n()
  const [status, setStatus] = useState<StatusFilter>('OUVERT')
  const [blPendingOnly, setBlPendingOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [groups, setGroups] = useState<VracGroup[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [blDraft, setBlDraft] = useState<BlDraft>({ blNo: '', blDate: null, clientName: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)
  const [confirmClose, setConfirmClose] = useState<VracGroup | null>(null)
  const [preview, setPreview] = useState<{ id: number; html: string } | null>(null)

  const reload = useCallback(async () => {
    try {
      setGroups(
        await call(
          api.vrac.groups({
            status: status === 'ALL' ? null : status,
            blPending: blPendingOnly,
            search: search.trim() || null
          })
        )
      )
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [status, blPendingOnly, search])

  useEffect(() => {
    const timer = setTimeout(() => void reload(), 250)
    return () => clearTimeout(timer)
  }, [reload])

  async function run(work: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await work()
      await reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function showRecap(id: number): Promise<void> {
    setPreview({ id, html: await call(api.vrac.html(id, lang)) })
  }

  const close = (group: VracGroup): Promise<void> =>
    run(async () => {
      await call(api.vrac.close(group.id))
      setNotice({ kind: 'ok', text: t('vracGroup.closed') })
      // Le récapitulatif est ce qu'on remet au commercial : on l'ouvre tout de suite.
      await showRecap(group.id)
    })

  const reopen = (group: VracGroup): Promise<void> =>
    run(async () => {
      await call(api.vrac.reopen(group.id))
    })

  /**
   * Retrouve le BL dans HFSQL : reprend sa référence, sa date et son client, et
   * compare son poids au total pesé. Informatif : une différence est signalée,
   * jamais bloquante (le commercial a pu arrondir, ou facturer en plus).
   */
  const verifyBl = (group: VracGroup): Promise<void> =>
    run(async () => {
      const number = blDraft.blNo.trim()
      if (!number) return
      const lookup = await call(api.bl.lookup(number))
      setBlDraft({ blNo: lookup.reference, blDate: lookup.date, clientName: lookup.clientName })

      const check = compareBlToNet(lookup.totalWeightKg, group.totalNetKg)
      if (check.kind === 'unknown') {
        setNotice({
          kind: 'warn',
          text: t('ops.blCheck.unknown', { reference: lookup.reference })
        })
      } else {
        setNotice({
          kind: check.kind === 'match' ? 'ok' : 'warn',
          text: t(check.kind === 'match' ? 'ops.blCheck.match' : 'ops.blCheck.differs', {
            reference: lookup.reference,
            bl: formatKg(check.blWeightKg, lang),
            net: formatKg(check.netKg, lang),
            diff: formatKg(check.diffKg, lang)
          })
        })
      }
    })

  const linkBl = (group: VracGroup): Promise<void> =>
    run(async () => {
      const blNo = blDraft.blNo.trim()
      if (!blNo) return
      await call(
        api.vrac.linkBl({
          id: group.id,
          blNo,
          blDate: blDraft.blDate,
          partnerName: blDraft.clientName
        })
      )
      setNotice({ kind: 'ok', text: t('vracGroup.blLinked', { reference: blNo }) })
      setBlDraft({ blNo: '', blDate: null, clientName: null })
    })

  const toggle = (group: VracGroup): void => {
    setExpanded((current) => (current === group.id ? null : group.id))
    setBlDraft({ blNo: group.blNo ?? '', blDate: group.blDate, clientName: null })
    setNotice(null)
  }

  return (
    <div className="station">
      <section className="panel table-panel" aria-labelledby="vrac-title">
        <header className="panel-head">
          <h2 id="vrac-title">{t('vracGroup.title')}</h2>
          <Segmented
            label={t('vracGroup.title')}
            value={status}
            onChange={setStatus}
            options={[
              { value: 'OUVERT', label: t('vracGroup.filter.OUVERT') },
              { value: 'CLOS', label: t('vracGroup.filter.CLOS') },
              { value: 'ALL', label: t('vracGroup.filter.all') }
            ]}
          />
        </header>

        <p className="lead">
          <Icon name="info" size={22} />
          {t('vracGroup.intro')}
        </p>

        <div className="filter-bar">
          <label className="search-box">
            <Icon name="search" size={22} />
            <span className="sr-only">{t('common.search')}</span>
            <input
              type="search"
              value={search}
              placeholder={t('common.search')}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={blPendingOnly}
              onChange={(e) => setBlPendingOnly(e.target.checked)}
            />
            <span>{t('ops.blPendingOnly')}</span>
          </label>
          <button type="button" className="btn btn-secondary" onClick={() => void reload()}>
            <Icon name="refresh" size={20} />
            {t('common.refresh')}
          </button>
        </div>

        {error && (
          <Guide tone="error" title={t('common.error')} onDismiss={() => setError(null)}>
            {error}
          </Guide>
        )}
        {notice && (
          <Guide tone={notice.kind} onDismiss={() => setNotice(null)}>
            {notice.text}
          </Guide>
        )}

        <div className="vrac-list" aria-label={t('vracGroup.title')}>
          {groups.length === 0 && (
            <div className="empty">
              <Icon name="truck" size={44} />
              <p>{t('vracGroup.empty')}</p>
            </div>
          )}

          {groups.map((group) => {
            const blocker = closeBlocker(group)
            const isOpen = expanded === group.id
            return (
              <article className="vrac-card" key={group.id}>
                <header className="vrac-card-head">
                  <div className="vrac-ref">
                    <strong className="ticket-no">{group.reference}</strong>
                    <span
                      className={`chip ${group.status === 'OUVERT' ? 'chip-waiting' : 'chip-done'}`}
                    >
                      <Icon name={group.status === 'OUVERT' ? 'clock' : 'check'} size={16} />
                      {t(`vracGroup.status.${group.status}`)}
                    </span>
                    {isGroupBlPending(group) && (
                      <span className="chip chip-warn">
                        <Icon name="alert" size={16} />
                        {t('ops.blPending')}
                      </span>
                    )}
                    <small>{formatDateTime(group.createdAt)}</small>
                  </div>

                  <dl className="vrac-metrics">
                    <div>
                      <dt>{t('vracGroup.col.partner')}</dt>
                      <dd>{group.partnerName ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>{t('vracGroup.col.rotations')}</dt>
                      <dd>{group.weighedCount}</dd>
                    </div>
                    <div>
                      <dt>{t('vracGroup.col.total')}</dt>
                      <dd className="digits" dir="ltr">
                        {formatKg(group.totalNetKg, lang)}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('vracGroup.col.bl')}</dt>
                      <dd dir="ltr">{group.blNo ?? '—'}</dd>
                    </div>
                  </dl>
                </header>

                <div className="vrac-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-expanded={isOpen}
                    onClick={() => toggle(group)}
                  >
                    <Icon name="list" size={18} />
                    {isOpen ? t('common.close') : t('vracGroup.details')}
                  </button>
                  {group.status === 'OUVERT' ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy || blocker !== null}
                      onClick={() => setConfirmClose(group)}
                    >
                      <Icon name="check" size={18} />
                      {t('vracGroup.close')}
                    </button>
                  ) : (
                    !group.blNo && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busy}
                        onClick={() => void reopen(group)}
                      >
                        <Icon name="redo" size={18} />
                        {t('vracGroup.reopen')}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => void showRecap(group.id).catch((e) => setError(errorMessage(e)))}
                  >
                    <Icon name="printer" size={18} />
                    {t('vracGroup.recap')}
                  </button>
                  {group.awaitingCount > 0 && (
                    <span className="chip chip-waiting">
                      <Icon name="clock" size={16} />
                      {t('vracGroup.awaiting', { count: group.awaitingCount })}
                    </span>
                  )}
                </div>

                {group.status === 'OUVERT' && blocker && (
                  <p className="vrac-blocker">
                    <Icon name="alert" size={18} />
                    {t(`vracGroup.blocker.${blocker}`)}
                  </p>
                )}

                {isOpen && (
                  <div className="vrac-details">
                    <h3>{t('vracGroup.rotationList')}</h3>
                    <ul className="rotation-list">
                      {group.rotations.map((rotation, index) => (
                        <li key={rotation.operationId}>
                          <strong>
                            {index + 1}. {rotation.ticketNo}
                          </strong>
                          <span>
                            {rotation.plate ?? '—'} · {rotation.productCode ?? '—'}
                          </span>
                          <strong className="digits" dir="ltr">
                            {rotation.status === 'ANNULEE'
                              ? t('vracGroup.rotation.cancelled')
                              : rotation.weighed
                                ? formatKg(rotation.netWeight, lang)
                                : t('vracGroup.rotation.waiting')}
                          </strong>
                        </li>
                      ))}
                    </ul>

                    {group.weighedCount > 0 && (
                      <div className="bl-link-panel">
                        <h3>{t('vracGroup.linkBl')}</h3>
                        <div className="bl-lookup">
                          <input
                            value={blDraft.blNo}
                            maxLength={64}
                            dir="ltr"
                            placeholder={t('vracGroup.blPlaceholder')}
                            disabled={busy}
                            onChange={(e) =>
                              setBlDraft({ blNo: e.target.value, blDate: null, clientName: null })
                            }
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={busy || blDraft.blNo.trim() === ''}
                            onClick={() => void verifyBl(group)}
                          >
                            <Icon name="in" size={18} />
                            {t('ops.blCheck')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy || group.status !== 'CLOS' || blDraft.blNo.trim() === ''}
                            onClick={() => void linkBl(group)}
                          >
                            <Icon name="check" size={18} />
                            {t('vracGroup.linkBl')}
                          </button>
                        </div>
                        {group.status !== 'CLOS' && (
                          <p className="field-hint">{t('vracGroup.closeBeforeBl')}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <ConfirmDialog
        open={confirmClose != null}
        title={t('vracGroup.close')}
        confirmLabel={t('vracGroup.close')}
        cancelLabel={t('common.cancel')}
        icon="check"
        busy={busy}
        onCancel={() => setConfirmClose(null)}
        onConfirm={() => {
          const group = confirmClose
          setConfirmClose(null)
          if (group) void close(group)
        }}
      >
        <p>{t('vracGroup.confirmClose')}</p>
      </ConfirmDialog>

      {preview && (
        <TicketPreview
          html={preview.html}
          busy={busy}
          onClose={() => setPreview(null)}
          onPrint={() => {
            const id = preview.id
            setPreview(null)
            void run(async () => {
              const result = await call(api.vrac.print(id, lang))
              setNotice({ kind: 'ok', text: result.message ?? '' })
            })
          }}
        />
      )}
    </div>
  )
}

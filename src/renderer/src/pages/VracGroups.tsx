import { useCallback, useEffect, useState } from 'react'
import { closeBlocker, compareBlToNet, isGroupBlPending } from '@shared/domain/vrac'
import type { VracGroup, VracGroupStatus } from '@shared/types'
import { api, call, errorMessage, formatDateTime, formatKg } from '../api'
import TicketPreview from '../components/TicketPreview'
import { useI18n } from '../i18n'

type StatusFilter = VracGroupStatus | ''

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
  const [preview, setPreview] = useState<{ id: number; html: string } | null>(null)

  const reload = useCallback(async () => {
    try {
      setGroups(
        await call(
          api.vrac.groups({
            status: status === '' ? null : status,
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
      if (!window.confirm(t('vracGroup.confirmClose'))) return
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
        setNotice({ kind: 'warn', text: t('ops.blCheck.unknown', { reference: lookup.reference }) })
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
    <div className="card">
      <h2>{t('vracGroup.title')}</h2>
      <p className="muted">{t('vracGroup.intro')}</p>

      <div className="row filters">
        <input
          type="search"
          value={search}
          placeholder={t('common.search')}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="OUVERT">{t('vracGroup.filter.OUVERT')}</option>
          <option value="CLOS">{t('vracGroup.filter.CLOS')}</option>
          <option value="">{t('vracGroup.filter.all')}</option>
        </select>
        <label className="inline">
          <input
            type="checkbox"
            checked={blPendingOnly}
            onChange={(e) => setBlPendingOnly(e.target.checked)}
          />
          {t('ops.blPendingOnly')}
        </label>
        <button type="button" className="ghost" onClick={() => void reload()}>
          {t('common.refresh')}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && (
        <p className={notice.kind === 'ok' ? 'ok' : 'warn-box'} role="status">
          {notice.text}
        </p>
      )}

      <section className="vrac-list" aria-label={t('vracGroup.title')}>
        {groups.length === 0 && <p className="empty-state muted">{t('vracGroup.empty')}</p>}
        {groups.map((group) => {
            const blocker = closeBlocker(group)
            const isOpen = expanded === group.id
            return (
              <article className="vrac-card" key={group.id}>
                <div className="vrac-card-head">
                  <div className="vrac-ref">
                    <strong>{group.reference}</strong>
                    <span className="muted">{formatDateTime(group.createdAt)}</span>
                    <strong>{group.partnerName ?? '—'}</strong>
                  </div>
                  <div className="vrac-total"><span className="muted">{t('vracGroup.col.total')}</span><strong>{formatKg(group.totalNetKg, lang)}</strong></div>
                  <div className="vrac-count"><strong>{group.weighedCount}</strong> {t('vracGroup.col.rotations')}
                    {group.awaitingCount > 0 && <span className="badge warn">{t('vracGroup.awaiting', { count: String(group.awaitingCount) })}</span>}
                  </div>
                  <div className="vrac-status"><span className={group.status === 'OUVERT' ? 'badge warn' : 'badge ok'}>{t(`vracGroup.status.${group.status}`)}</span>
                    <span>{group.blNo ?? (isGroupBlPending(group) ? t('ops.blPending') : '—')}</span>
                  </div>
                </div>
                <div className="row actions vrac-actions">
                  <button type="button" className="ghost" aria-expanded={isOpen} onClick={() => toggle(group)}>{isOpen ? t('common.close') : t('vracGroup.details')}</button>
                  {group.status === 'OUVERT' ? (
                    <button type="button" className="primary" disabled={busy || blocker !== null} onClick={() => void close(group)}>{t('vracGroup.close')}</button>
                  ) : !group.blNo && <button type="button" className="ghost" disabled={busy} onClick={() => void reopen(group)}>{t('vracGroup.reopen')}</button>}
                  <button type="button" className="ghost" disabled={busy} onClick={() => void showRecap(group.id).catch((e) => setError(errorMessage(e)))}>{t('vracGroup.recap')}</button>
                </div>
                {group.status === 'OUVERT' && blocker && <p className="warn-box vrac-blocker">{t(`vracGroup.blocker.${blocker}`)}</p>}

                {isOpen && (
                  <div className="vrac-details">
                    <h3>{t('vracGroup.rotationList')}</h3>
                    <ul className="rotation-list">
                      {group.rotations.map((rotation, index) => (
                        <li key={rotation.operationId}>
                          <strong>{index + 1}. {rotation.ticketNo}</strong>
                          <span>{rotation.plate ?? '—'} · {rotation.productCode ?? '—'}</span>
                          <strong>{rotation.status === 'ANNULEE' ? t('vracGroup.rotation.cancelled') : rotation.weighed ? formatKg(rotation.netWeight, lang) : t('vracGroup.rotation.waiting')}</strong>
                        </li>
                      ))}
                    </ul>
                    {group.weighedCount > 0 && (
                      <div className="bl-link-panel">
                        <h3>{t('vracGroup.linkBl')}</h3>
                        <div className="row bl-lookup">
                          <input
                            value={blDraft.blNo}
                            maxLength={64}
                            placeholder={t('vracGroup.blPlaceholder')}
                            disabled={busy}
                            onChange={(e) =>
                              setBlDraft({ blNo: e.target.value, blDate: null, clientName: null })
                            }
                          />
                          <button
                            type="button"
                            className="ghost"
                            disabled={busy || blDraft.blNo.trim() === ''}
                            onClick={() => void verifyBl(group)}
                          >
                            {t('ops.blCheck')}
                          </button>
                          <button
                            type="button"
                            className="primary"
                            disabled={busy || group.status !== 'CLOS' || blDraft.blNo.trim() === ''}
                            onClick={() => void linkBl(group)}
                          >
                            {t('vracGroup.linkBl')}
                          </button>
                        </div>
                        {group.status !== 'CLOS' && <p className="muted">{t('vracGroup.closeBeforeBl')}</p>}
                      </div>
                    )}
                  </div>
                )}
              </article>
            )
          })}
      </section>

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

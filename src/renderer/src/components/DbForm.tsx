import { useEffect, useState, type FormEvent } from 'react'
import type { DbConfig } from '@shared/channels'
import { api, call, errorMessage } from '../api'
import { useI18n } from '../i18n'
import Field from './Field'
import Guide from './Guide'
import Icon from './Icon'

const EMPTY: DbConfig = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  database: 'balance'
}

/** Connexion MySQL + création des tables. Réutilisé avant connexion et dans Paramètres. */
export default function DbForm({ onConnected }: { onConnected?: () => void }) {
  const { t } = useI18n()
  const [cfg, setCfg] = useState<DbConfig>(EMPTY)
  const [hasSavedPassword, setHasSavedPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState<boolean | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    api.settings
      .get()
      .then((s) => {
        if (s.db) {
          const { hasPassword, ...db } = s.db
          setCfg({ ...db, password: '' })
          setHasSavedPassword(hasPassword)
        }
      })
      .catch(() => undefined)
  }, [])

  async function connect(event: FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const result = await call(api.settings.saveDb(cfg))
      setOk(result.ok)
      setMessage(result.message)
      if (result.ok) onConnected?.()
    } catch (err) {
      setOk(false)
      setMessage(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function createTables(): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      const result = await call(api.db.migrate())
      setOk(result.ok)
      setMessage(result.message)
    } catch (err) {
      setOk(false)
      setMessage(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel settings-card" onSubmit={connect}>
      <h2>{t('db.title')}</h2>
      <div className="form-grid">
        <Field label={t('db.host')}>
          <input
            dir="ltr"
            value={cfg.host}
            onChange={(e) => setCfg({ ...cfg, host: e.target.value })}
          />
        </Field>
        <Field label={t('db.port')}>
          <input
            type="number"
            dir="ltr"
            value={cfg.port}
            onChange={(e) => setCfg({ ...cfg, port: Number(e.target.value) })}
          />
        </Field>
        <Field label={t('db.user')}>
          <input
            dir="ltr"
            value={cfg.user}
            onChange={(e) => setCfg({ ...cfg, user: e.target.value })}
          />
        </Field>
        <Field label={t('db.password')}>
          <input
            type="password"
            dir="ltr"
            autoComplete="off"
            placeholder={hasSavedPassword ? t('db.passwordSaved') : undefined}
            value={cfg.password}
            onChange={(e) => setCfg({ ...cfg, password: e.target.value })}
          />
        </Field>
        <Field label={t('db.database')}>
          <input
            dir="ltr"
            value={cfg.database}
            onChange={(e) => setCfg({ ...cfg, database: e.target.value })}
          />
        </Field>
      </div>

      <div className="button-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <Icon name="check" size={20} />
          {t('db.test')}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void createTables()}
        >
          {t('db.migrate')}
        </button>
      </div>

      {message && <Guide tone={ok ? 'ok' : 'error'}>{message}</Guide>}
    </form>
  )
}

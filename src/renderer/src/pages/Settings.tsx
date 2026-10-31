import { useEffect, useState, type FormEvent } from 'react'
import type { AppStatus } from '@shared/channels'
import { api, call, errorMessage } from '../api'
import BalanceForm from '../components/BalanceForm'
import DbForm from '../components/DbForm'
import Field from '../components/Field'
import Guide from '../components/Guide'
import Icon from '../components/Icon'
import PasswordForm from '../components/PasswordForm'
import { useI18n } from '../i18n'

/** Nom de la société : c'est lui qui s'imprime en tête du ticket. */
function CompanyForm() {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.settings
      .getCompany()
      .then(setName)
      .catch(() => undefined)
  }, [])

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setSaved(false)
    setError(null)
    try {
      const result = await call(api.settings.saveCompany(name))
      if (result.ok) setSaved(true)
      else setError(result.message)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form className="panel settings-card" onSubmit={submit}>
      <h2>{t('settings.company')}</h2>
      <Field label={t('settings.companyName')}>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setSaved(false)
          }}
        />
      </Field>
      <div className="button-row">
        <button type="submit" className="btn btn-primary" disabled={name.trim().length === 0}>
          <Icon name="check" size={20} />
          {t('common.save')}
        </button>
        {saved && (
          <span className="chip chip-done">
            <Icon name="check" size={16} />
            {t('settings.saved')}
          </span>
        )}
      </div>
      {error && <Guide tone="error">{error}</Guide>}
    </form>
  )
}

/** Adresse du service BL (HFSQL) : vide = adresse locale par défaut. */
function BlApiForm() {
  const { t } = useI18n()
  const [url, setUrl] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.settings
      .getBlApi()
      .then((value) => setUrl(value ?? ''))
      .catch(() => undefined)
  }, [])

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setSaved(false)
    setError(null)
    try {
      const result = await call(api.settings.saveBlApi(url.trim()))
      if (result.ok) setSaved(true)
      else setError(result.message)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form className="panel settings-card" onSubmit={submit}>
      <h2>{t('settings.blApi')}</h2>
      <Field label={t('settings.blApiUrl')} hint={t('settings.blApiHint')}>
        <input
          dir="ltr"
          autoComplete="off"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setSaved(false)
          }}
        />
      </Field>
      <div className="button-row">
        <button type="submit" className="btn btn-primary">
          <Icon name="check" size={20} />
          {t('common.save')}
        </button>
        {saved && (
          <span className="chip chip-done">
            <Icon name="check" size={16} />
            {t('settings.saved')}
          </span>
        )}
      </div>
      {error && <Guide tone="error">{error}</Guide>}
    </form>
  )
}

export default function Settings() {
  const { t } = useI18n()
  const [status, setStatus] = useState<AppStatus | null>(null)

  useEffect(() => {
    api.app
      .status()
      .then(setStatus)
      .catch(() => undefined)
  }, [])

  const dbLabel = !status
    ? t('common.loading')
    : !status.dbConfigured
      ? t('db.notConfigured')
      : status.dbConnected
        ? t('db.connected')
        : t('db.disconnected')

  return (
    <div className="settings">
      <header className="settings-head">
        <h1>{t('settings.title')}</h1>
        <span className={status?.dbConnected ? 'chip chip-done' : 'chip chip-waiting'}>
          {t('db.title')} : {dbLabel}
        </span>
      </header>

      <Guide tone="warn">{t('settings.adminWarning')}</Guide>

      <DbForm onConnected={() => void api.app.status().then(setStatus)} />
      <BalanceForm />
      {status?.dbConnected && <CompanyForm />}
      {status?.dbConnected && <PasswordForm />}
      {status?.dbConnected && <BlApiForm />}

      <section className="panel settings-card">
        <h2>{t('settings.app')}</h2>
        <p className="muted">
          {t('settings.version')} : 0.1.0 — {t('app.station')} : {status?.balance.port ?? '—'}
        </p>
      </section>
    </div>
  )
}

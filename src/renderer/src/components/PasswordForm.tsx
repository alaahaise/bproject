import { useState, type FormEvent } from 'react'
import { api, call, errorMessage } from '../api'
import { useI18n } from '../i18n'
import Field from './Field'
import Guide from './Guide'
import Icon from './Icon'

/** Changement du mot de passe du compte connecté : ancien mot de passe exigé. */
export default function PasswordForm() {
  const { t } = useI18n()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setSaved(false)
    setError(null)
    setBusy(true)
    try {
      await call(api.auth.changePassword(currentPassword, newPassword))
      setCurrentPassword('')
      setNewPassword('')
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel settings-card" onSubmit={submit}>
      <h2>{t('settings.password')}</h2>
      <div className="pair">
        <Field label={t('settings.currentPassword')}>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value)
              setSaved(false)
            }}
          />
        </Field>
        <Field label={t('settings.newPassword')}>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value)
              setSaved(false)
            }}
          />
        </Field>
      </div>
      <div className="button-row">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || currentPassword === '' || newPassword.length < 8}
        >
          <Icon name="check" size={20} />
          {t('common.save')}
        </button>
        {saved && (
          <span className="chip chip-done">
            <Icon name="check" size={16} />
            {t('settings.passwordChanged')}
          </span>
        )}
      </div>
      {error && <Guide tone="error">{error}</Guide>}
    </form>
  )
}

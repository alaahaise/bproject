import { useState, type FormEvent } from 'react'
import { api, call, errorMessage } from '../api'
import { useI18n } from '../i18n'

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
    <section className="card">
      <h2>{t('settings.password')}</h2>
      <form className="grid" onSubmit={submit}>
        <label>
          {t('settings.currentPassword')}
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>
        <label>
          {t('settings.newPassword')}
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </label>
        <div className="row">
          <button type="submit" disabled={busy || newPassword.length < 8}>
            {t('common.save')}
          </button>
          {saved && <span className="ok">{t('settings.passwordChanged')}</span>}
        </div>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  )
}

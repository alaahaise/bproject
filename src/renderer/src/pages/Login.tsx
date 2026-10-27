import { useState, type FormEvent } from 'react'
import type { SessionUser } from '@shared/types'
import caspmLogo from '@shared/assets/caspm-logo.png'
import { api, call, errorMessage } from '../api'
import { useI18n } from '../i18n'
import DbForm from '../components/DbForm'

/**
 * La connexion est le premier écran d'un poste neuf : la configuration de la
 * base doit donc être atteignable ici, sinon personne ne peut entrer pour
 * aller la régler.
 */
export default function Login({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const { t, lang, setLang } = useI18n()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [showSetup, setShowSetup] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onLogin(await call(api.auth.login(username, password)))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-page login-page">
      <div className="login-language">
        <label htmlFor="login-language">{t('login.language')}</label>
        <select id="login-language" value={lang} onChange={(e) => setLang(e.target.value as 'fr' | 'ar')}>
          <option value="fr">Français</option>
          <option value="ar">العربية</option>
        </select>
      </div>
      <form className="card login" onSubmit={submit}>
        <img className="login-logo" src={caspmLogo} alt="CASPM — Complexe Avicole" />
        <p className="login-caption">{t('app.title')}</p>
        <h2>{t('login.title')}</h2>
        <label>
          {t('login.username')}
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          {t('login.password')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" disabled={busy}>
          {t('login.submit')}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="button" className="link" onClick={() => setShowSetup(!showSetup)}>
          {t('login.setup')}
        </button>
      </form>

      {showSetup && (
        <div className="auth-setup">
          <DbForm />
          <p className="muted">{t('login.hint')}</p>
        </div>
      )}
    </div>
  )
}

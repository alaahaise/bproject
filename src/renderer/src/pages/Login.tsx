import { useState, type FormEvent } from 'react'
import type { SessionUser } from '@shared/types'
import caspmLogo from '@shared/assets/caspm-logo.png'
import { api, call, errorMessage } from '../api'
import DbForm from '../components/DbForm'
import Field from '../components/Field'
import Guide from '../components/Guide'
import Icon from '../components/Icon'
import Segmented from '../components/Segmented'
import { useI18n, type Lang } from '../i18n'

/**
 * La connexion est le premier écran d'un poste neuf : la configuration de la
 * base doit donc être atteignable ici, sinon personne ne peut entrer pour
 * aller la régler. La langue aussi se choisit ici : quelqu'un qui lit l'arabe
 * ne doit pas avoir à se connecter en français pour la changer.
 */
export default function Login({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const { t, lang, setLang } = useI18n()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
    <div className="login-page">
      <div className="login-lang">
        <Segmented<Lang>
          label={t('nav.language')}
          value={lang}
          onChange={setLang}
          options={[
            { value: 'fr', label: 'Français' },
            { value: 'ar', label: 'العربية' }
          ]}
        />
      </div>

      <form className="login-card" onSubmit={submit}>
        <img className="login-logo" src={caspmLogo} alt="CASPM" />
        <h1>{t('app.title')}</h1>
        <p className="muted">{t('login.sub')}</p>

        <Field label={t('login.username')}>
          <input
            value={username}
            autoComplete="username"
            autoFocus
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>

        <Field label={t('login.password')}>
          <span className="input-action">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary"
              aria-pressed={showPassword}
              onClick={() => setShowPassword(!showPassword)}
            >
              <Icon name={showPassword ? 'eye-off' : 'eye'} size={22} />
              {showPassword ? t('login.hide') : t('login.show')}
            </button>
          </span>
        </Field>

        {error && <Guide tone="error">{error}</Guide>}

        <button type="submit" className="btn btn-primary btn-xl" disabled={busy}>
          {t('login.submit')}
        </button>

        <button type="button" className="btn btn-link" onClick={() => setShowSetup(!showSetup)}>
          <Icon name="settings" size={20} />
          {t('login.setup')}
        </button>
      </form>

      {showSetup && (
        <div className="login-setup">
          <DbForm />
          <p className="muted">{t('login.hint')}</p>
        </div>
      )}
    </div>
  )
}

import { Fragment, useEffect, useState } from 'react'
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { DEFAULT_PAGE_SIZE } from '@shared/domain/paging'
import type { OperationType, SessionUser } from '@shared/types'
import { api, call, TICKETS_CHANGED } from './api'
import HelpDialog from './components/HelpDialog'
import Icon, { type IconName } from './components/Icon'
import Segmented from './components/Segmented'
import { useI18n, type Lang } from './i18n'
import Balance1 from './pages/Balance1'
import Balance2 from './pages/Balance2'
import Login from './pages/Login'
import Operations from './pages/Operations'
import Settings from './pages/Settings'
import VracGroups from './pages/VracGroups'

/**
 * Le menu latéral ne porte que les types de pesée (on ne mélange pas les entrées
 * et les sorties) ; les deux balances et les tickets du type choisi sont des
 * onglets en haut de la page.
 *
 * Chaque type a sa couleur (CSS : `data-type`), reprise dans le menu, le bandeau
 * et les boutons : l'opérateur voit à tout moment s'il est sur une entrée ou une
 * sortie, et un changement de menu se remarque par l'animation du bandeau.
 */
const MENUS: ReadonlyArray<{ type: OperationType; path: string; icon: IconName }> = [
  { type: 'ENTREE', path: '/entrees', icon: 'in' },
  { type: 'SORTIE', path: '/sorties', icon: 'out' },
  { type: 'TRANSFERT', path: '/transferts', icon: 'swap' },
  { type: 'TIERS', path: '/tiers', icon: 'third' }
]

/** Période de rafraîchissement du compteur de camions en attente (en plus des événements). */
const WAITING_REFRESH_MS = 15_000

export default function App() {
  const { t } = useI18n()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api.auth
      .current()
      .then((current) => setUser(current))
      .catch(() => undefined)
      .finally(() => setReady(true))
  }, [])

  if (!ready) return <p className="center-page muted">{t('common.loading')}</p>
  if (!user) return <Login onLogin={setUser} />

  return (
    <HashRouter>
      <Shell user={user} onLogout={() => setUser(null)} />
    </HashRouter>
  )
}

/**
 * Nombre de camions pesés une fois qui attendent leur 2e pesée, pour le type affiché.
 * Il se met à jour quand l'écran change, quand un ticket change (événement) et,
 * par sécurité, toutes les quelques secondes (un autre poste peut créer des tickets).
 */
function useWaitingCount(type: OperationType | null, pathname: string): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!type) return
    let active = true
    const load = (): void => {
      api.ops
        .page({
          type,
          status: 'OUVERTE',
          awaitingSecond: true,
          page: 1,
          pageSize: DEFAULT_PAGE_SIZE
        })
        .then((result) => {
          if (active) setCount(result.total)
        })
        .catch(() => undefined)
    }
    load()
    window.addEventListener(TICKETS_CHANGED, load)
    const timer = setInterval(load, WAITING_REFRESH_MS)
    return () => {
      active = false
      window.removeEventListener(TICKETS_CHANGED, load)
      clearInterval(timer)
    }
  }, [type, pathname])

  return type ? count : 0
}

/** Le menu est dans le Router : il doit savoir quelle page est ouverte. */
function Shell({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const { t, lang, setLang } = useI18n()
  const location = useLocation()
  const [helpOpen, setHelpOpen] = useState(false)
  const currentMenu = MENUS.find((menu) => location.pathname.startsWith(menu.path)) ?? null
  const currentType = currentMenu?.type ?? null
  const waiting = useWaitingCount(currentType, location.pathname)

  return (
    <div className="shell" data-type={currentType ?? undefined}>
      <aside className="rail">
        <div className="rail-brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="scale" size={26} />
          </span>
          <span>{t('app.title')}</span>
        </div>

        <nav className="type-nav" aria-label={t('nav.menu')}>
          {MENUS.map((menu) => (
            // Actif sur les trois onglets du type, pas seulement sur la 1re balance.
            <NavLink
              key={menu.type}
              to={`${menu.path}/balance-1`}
              data-type={menu.type}
              className={currentType === menu.type ? 'active' : undefined}
            >
              <span className="type-icon">
                <Icon name={menu.icon} size={28} />
              </span>
              <span>{t(`station.type.${menu.type}`)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="rail-tools">
          <NavLink to="/settings" className="tool">
            <Icon name="settings" size={22} />
            {t('nav.settings')}
          </NavLink>
          <button type="button" className="tool" onClick={() => setHelpOpen(true)}>
            <Icon name="help" size={22} />
            {t('nav.help')}
          </button>
        </div>

        <div className="rail-foot">
          <Segmented<Lang>
            className="segmented-rail"
            label={t('nav.language')}
            value={lang}
            onChange={setLang}
            options={[
              { value: 'fr', label: 'Français' },
              { value: 'ar', label: 'العربية' }
            ]}
          />
          <span className="rail-user">{user.fullName}</span>
          <button
            type="button"
            className="tool"
            onClick={() => {
              void call(api.auth.logout()).finally(onLogout)
            }}
          >
            <Icon name="logout" size={22} />
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      <main>
        {currentMenu && (
          // `key` : le bandeau est recréé quand le type change, ce qui rejoue son animation
          // (et seulement alors : passer d'un onglet à l'autre ne le fait pas bouger).
          // Les clés du bandeau et de la page doivent différer : deux frères de même clé
          // empêchent React de retirer l'ancien bandeau, et ils s'empilent à chaque clic.
          <header className="type-band" key={`band-${currentMenu.type}`}>
            <div className="band-id">
              <span className="band-icon" aria-hidden="true">
                <Icon name={currentMenu.icon} size={36} />
              </span>
              <div>
                <h1>{t(`station.type.${currentMenu.type}`)}</h1>
                <p>{t(`station.hint.${currentMenu.type}`)}</p>
              </div>
            </div>

            <nav className="journey-tabs">
              <NavLink to={`${currentMenu.path}/balance-1`} className="tab">
                <span className="tab-num" aria-hidden="true">
                  1
                </span>
                <span className="tab-text">
                  <strong>{t('nav.balance1')}</strong>
                  <small>{t('nav.balance1.sub')}</small>
                </span>
              </NavLink>
              <NavLink to={`${currentMenu.path}/balance-2`} className="tab">
                <span className="tab-num" aria-hidden="true">
                  2
                </span>
                <span className="tab-text">
                  <strong>{t('nav.balance2')}</strong>
                  <small>{t('nav.balance2.sub')}</small>
                </span>
                {waiting > 0 && (
                  <span className="tab-badge" title={t('nav.waiting', { n: waiting })}>
                    {waiting}
                    <span className="sr-only"> — {t('nav.waiting', { n: waiting })}</span>
                  </span>
                )}
              </NavLink>
              <NavLink to={`${currentMenu.path}/tickets`} className="tab tab-plain">
                <Icon name="list" size={24} />
                <span className="tab-text">
                  <strong>{t('nav.tickets')}</strong>
                </span>
              </NavLink>
              {currentMenu.type === 'SORTIE' && (
                <NavLink to={`${currentMenu.path}/vrac`} className="tab tab-plain">
                  <Icon name="truck" size={24} />
                  <span className="tab-text">
                    <strong>{t('nav.vrac')}</strong>
                  </span>
                </NavLink>
              )}
            </nav>
          </header>
        )}

        <div className="page" key={`page-${currentMenu?.type ?? 'settings'}`}>
          <Routes>
            {MENUS.map((menu) => (
              <Fragment key={menu.type}>
                <Route path={`${menu.path}/balance-1`} element={<Balance1 type={menu.type} />} />
                <Route path={`${menu.path}/balance-2`} element={<Balance2 type={menu.type} />} />
                <Route path={`${menu.path}/tickets`} element={<Operations type={menu.type} />} />
                {menu.type === 'SORTIE' && (
                  <Route path={`${menu.path}/vrac`} element={<VracGroups />} />
                )}
              </Fragment>
            ))}
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/entrees/balance-1" replace />} />
          </Routes>
        </div>
      </main>

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

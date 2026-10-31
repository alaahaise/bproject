import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import Icon from './Icon'

/**
 * Fenêtre modale sur l'élément natif <dialog> : le navigateur gère le piège du
 * focus, la touche Échap et l'inertie du reste de la page, ce qu'une div
 * « modale » faite à la main fait souvent mal.
 *
 * Un clic sur le fond (hors de la fenêtre) ferme, comme Échap.
 */
export default function Dialog({
  open,
  onClose,
  title,
  size = 'md',
  footer,
  children
}: {
  open: boolean
  onClose: () => void
  title: string
  size?: 'sm' | 'md' | 'lg'
  footer?: ReactNode
  children: ReactNode
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  // `close()` au démontage aussi : le focus retourne alors au bouton qui avait ouvert la fenêtre.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !open) return
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`dialog dialog-${size}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // Seul un clic sur le fond (l'élément <dialog> lui-même) ferme.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {open && (
        <div className="dialog-box">
          <header className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="btn btn-ghost btn-icon" onClick={onClose}>
              <Icon name="x" />
              <span className="sr-only">{t('common.close')}</span>
            </button>
          </header>
          <div className="dialog-body">{children}</div>
          {footer && <footer className="dialog-foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}

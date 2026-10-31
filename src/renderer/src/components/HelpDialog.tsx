import { useI18n } from '../i18n'
import Dialog from './Dialog'
import Icon from './Icon'

/**
 * « Comment ça marche ? » : le fonctionnement de la pesée en six phrases, à portée
 * d'un clic depuis n'importe quel écran. Quelqu'un qui découvre l'application doit
 * pouvoir se débrouiller sans notice.
 */
export default function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const items = [
    { icon: 'truck', text: t('help.intro') },
    { icon: 'scale', text: t('help.b1') },
    { icon: 'scale', text: t('help.b2') },
    { icon: 'list', text: t('help.tickets') },
    { icon: 'keyboard', text: t('help.manual') },
    { icon: 'redo', text: t('help.redo') },
    { icon: 'info', text: t('help.types') }
  ] as const

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('help.title')}
      size="md"
      footer={
        <button type="button" className="btn btn-primary btn-lg" onClick={onClose}>
          {t('common.close')}
        </button>
      }
    >
      <ul className="help-list">
        {items.map((item) => (
          <li key={item.text}>
            <span className="help-icon">
              <Icon name={item.icon} size={24} />
            </span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}

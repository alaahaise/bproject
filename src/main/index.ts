import { app, BrowserWindow } from 'electron'
import { ensureAdmin } from './auth'
import { ensureBlApi, stopBlApi } from './bl/process'
import { migrate } from './db/migrate'
import * as pool from './db/pool'
import { registerIpc } from './ipc'
import { loadSettings } from './settings'
import { createWindow } from './window'

// Un seul poste par dossier utilisateur : deux instances se disputeraient le
// même port COM.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    registerIpc()
    createWindow()

    // La connexion reprend la configuration du poste. Un échec ne doit pas
    // empêcher l'application de démarrer : l'écran Paramètres sert à la corriger.
    const settings = loadSettings()

    // Démarrage en parallèle de la connexion MySQL : l'API BL est indépendante
    // et doit être prête avant la première recherche de bon de livraison.
    void ensureBlApi(settings.blApiUrl).catch((err) => {
      try {
        console.error(
          '[bl-api] démarrage impossible :',
          err instanceof Error ? err.message : String(err)
        )
      } catch {
        // Pas de console (application lancée sans terminal) : ne pas bloquer.
      }
    })

    if (settings.db) {
      try {
        await pool.connect(settings.db)
        const applied = await migrate(settings.db)
        const bootstrapPassword = await ensureAdmin()
        if (bootstrapPassword) {
          console.warn(
            `[bootstrap] Compte « admin » créé avec le mot de passe « ${bootstrapPassword} » — à changer.`
          )
        }
        console.log(
          `[db] connectée à ${settings.db.database}@${settings.db.host}` +
            (applied.length > 0 ? ` — migrations : ${applied.join(', ')}` : '')
        )
      } catch (err) {
        console.error('[db] connexion impossible :', err)
      }
    }
  })

  app.on('before-quit', stopBlApi)

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

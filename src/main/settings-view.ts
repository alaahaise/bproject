import type { AppSettings, AppSettingsView } from '@shared/channels'

/** Drops the database secret before settings cross into the renderer. */
export function toSettingsView(settings: AppSettings): AppSettingsView {
  return {
    ...settings,
    db: settings.db
      ? {
          host: settings.db.host,
          port: settings.db.port,
          user: settings.db.user,
          database: settings.db.database,
          hasPassword: settings.db.password !== ''
        }
      : null
  }
}

import { readFileSync } from 'node:fs'
import caspmLogoPath from '@shared/assets/caspm-logo.png?asset'

/** Local copy of the official CASPM logo, embedded so ticket printing works offline. */
export const CASPM_LOGO_DATA_URI = `data:image/png;base64,${readFileSync(caspmLogoPath).toString('base64')}`

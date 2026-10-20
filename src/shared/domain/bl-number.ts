/**
 * Lecture d'un numéro de BL tel qu'un agent le tape.
 *
 * Formes acceptées :
 *   BL26-05255, BL2605255, BL26-5255, BL 26-05255
 *   BL2026-05255, BL202605255
 *   26-05255, 2026-05255, 2605255
 *   5255, 05255, BL 5255
 *
 * Une année sur deux chiffres vaut 2000-2099. Logique pure : partagée entre le
 * service HFSQL (qui l'applique) et l'application (qui peut la tester).
 */

export class BlNumberError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'BlNumberError'
  }
}

export interface ParsedBlNumber {
  /** Référence exacte quand le format est inconnu (ancien format). */
  reference: string | null
  year: number | null
  number: number | null
}

export function parseYear(value: unknown, label = 'year'): number | null {
  if (value === undefined || value === null || value === '') return null
  const text = String(value).trim()
  if (!/^\d{2}$|^\d{4}$/.test(text)) {
    throw new BlNumberError(`Invalid ${label}: "${String(value)}"`)
  }
  const year = text.length === 2 ? 2000 + Number(text) : Number(text)
  if (year < 2000 || year > 2100) {
    throw new BlNumberError(`Invalid ${label}: "${String(value)}"`)
  }
  return year
}

/**
 * Tentatives dans l'ordre : la première qui correspond gagne. L'ordre compte :
 * l'année à quatre chiffres n'est lue que si elle est nettement séparée
 * (BL2026-05255) ; sinon BL2605255 serait lu comme l'année 2605.
 */
const YEAR_NUMBER_PATTERNS: Array<{ re: RegExp; fullYear: boolean }> = [
  { re: /^BL-?(\d{4})-(\d{1,6})$/, fullYear: true },
  { re: /^BL-?(\d{4})(\d{5})$/, fullYear: true },
  { re: /^BL-?(\d{2})-(\d{1,6})$/, fullYear: false },
  // Le minimum de 4 chiffres évite de lire BL05255 comme année 2005 / n° 255.
  { re: /^BL-?(\d{2})(\d{4,6})$/, fullYear: false },
  { re: /^(\d{4})-(\d{1,6})$/, fullYear: true },
  { re: /^(\d{2})-(\d{1,6})$/, fullYear: false },
  { re: /^(\d{4})(\d{5})$/, fullYear: true },
  { re: /^(\d{2})(\d{5})$/, fullYear: false }
]

export function parseBlInput(raw: unknown, yearParam?: unknown): ParsedBlNumber {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new BlNumberError('BL number is required.')
  }

  const explicitYear = parseYear(yearParam)
  const input = String(raw)
    .trim()
    .toUpperCase()
    .replace(/N\s*[°º]/g, '')
    .replace(/^(NO|#)\s*/, '')
    .replace(/[\s._/]/g, '')

  let year: number | null = null
  let number: number | null = null
  let reference: string | null = null

  for (const { re, fullYear } of YEAR_NUMBER_PATTERNS) {
    const match = re.exec(input)
    if (!match) continue
    year = fullYear ? Number(match[1]) : 2000 + Number(match[1])
    number = Number(match[2])
    break
  }

  // BL5255 / BL05255 puis 5255 : un numéro sans année.
  if (year === null) {
    const bare = /^BL-?(\d{1,6})$/.exec(input) ?? /^(\d{1,6})$/.exec(input)
    if (bare) number = Number(bare[1])
  }

  if (year === null && number === null && /^BL\d{5,8}$/.test(input)) {
    throw new BlNumberError(`Unrecognised BL number: "${String(raw)}"`)
  }

  if (number === null) {
    // Une référence complète de format inconnu passe telle quelle (égalité exacte).
    if (/^BL[A-Z0-9-]{1,20}$/.test(input)) {
      reference = input
    } else {
      throw new BlNumberError(`Unrecognised BL number: "${String(raw)}"`)
    }
  }

  if (year !== null && (year < 2000 || year > 2100)) {
    throw new BlNumberError(`Invalid year: "${year}"`)
  }
  if (number !== null && (number < 0 || number > 999999)) {
    throw new BlNumberError(`Invalid BL number: "${number}"`)
  }

  if (explicitYear !== null) {
    if (year !== null && year !== explicitYear) {
      throw new BlNumberError(
        `The year in the BL number (${year}) does not match the requested year (${explicitYear}).`
      )
    }
    year = explicitYear
  }

  return { reference, year, number }
}

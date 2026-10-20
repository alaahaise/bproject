/**
 * Aides pour construire du SQL sans paramètres.
 *
 * Le pilote ODBC HFSQL n'accepte pas les marqueurs `?` : toutes les valeurs
 * sont donc écrites dans la requête. Seules des valeurs validées (ou venant de
 * la base elle-même) doivent arriver ici.
 */

export function quoteString(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  return `'${String(value).replace(/'/g, "''")}'`
}

export function toSafeInt(value: unknown): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw new Error(`Invalid integer value: ${String(value)}`)
  }
  return number
}

export function int(value: unknown): string {
  return String(toSafeInt(value))
}

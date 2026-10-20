/**
 * Métadonnées des colonnes HFSQL (via ODBC), utilisées pour construire des
 * SELECT explicites : le pilote renvoie zéro ligne pour `SELECT * FROM Articles`
 * et dès qu'une colonne binaire (IMAGE) est sélectionnée.
 */
import type { Db, Row } from './db'

export const TABLES = ['Mouvement', 'Ligne_MT', 'Tiers', 'Articles'] as const

// Codes de type SQL ODBC (DATA_TYPE). TYPE_NAME de ce pilote est peu fiable
// (il répond CHAR pour tout), DATA_TYPE l'est.
const TYPE_NAMES: Record<number, string> = {
  [-10]: 'SQL_WLONGVARCHAR',
  [-9]: 'SQL_WVARCHAR',
  [-8]: 'SQL_WCHAR',
  [-7]: 'SQL_BIT',
  [-6]: 'SQL_TINYINT',
  [-5]: 'SQL_BIGINT',
  [-4]: 'SQL_LONGVARBINARY',
  [-3]: 'SQL_VARBINARY',
  [-2]: 'SQL_BINARY',
  [-1]: 'SQL_LONGVARCHAR',
  0: 'SQL_NULL',
  1: 'SQL_CHAR',
  2: 'SQL_NUMERIC',
  3: 'SQL_DECIMAL',
  4: 'SQL_INTEGER',
  5: 'SQL_SMALLINT',
  6: 'SQL_FLOAT',
  7: 'SQL_REAL',
  8: 'SQL_DOUBLE',
  9: 'SQL_DATE',
  10: 'SQL_TIME',
  11: 'SQL_TIMESTAMP',
  12: 'SQL_VARCHAR',
  91: 'SQL_TYPE_DATE',
  92: 'SQL_TYPE_TIME',
  93: 'SQL_TYPE_TIMESTAMP'
}

const BINARY_TYPES = new Set([-4, -3, -2])

export interface ColumnInfo {
  name: string
  position: number | null
  type: string
  dataType: number
  size: number | null
  nullable: boolean
  remarks: string | null
}

export type SchemaMap = Record<string, ColumnInfo[]>

export class UnknownTableError extends Error {
  readonly code = 'UNKNOWN_TABLE'

  constructor(table: string) {
    super(`Unknown table: ${table}`)
    this.name = 'UnknownTableError'
  }
}

export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function isBinary(column: ColumnInfo): boolean {
  return BINARY_TYPES.has(column.dataType) || /^IMAGE$/i.test(column.name)
}

function toColumn(row: Row): ColumnInfo {
  const dataType = Number(row.DATA_TYPE)
  const remarks = row.REMARKS ? String(row.REMARKS).trim() : ''
  return {
    name: String(row.COLUMN_NAME ?? ''),
    position: row.ORDINAL_POSITION === undefined ? null : Number(row.ORDINAL_POSITION),
    type: TYPE_NAMES[dataType] ?? `SQL_${dataType}`,
    dataType,
    size: row.COLUMN_SIZE === undefined ? null : Number(row.COLUMN_SIZE),
    nullable: row.IS_NULLABLE === 'YES',
    remarks: remarks || null
  }
}

export interface Schema {
  load(force?: boolean): Promise<SchemaMap>
  selectColumns(table: string): Promise<ColumnInfo[]>
  selectAll(table: string, where: string, orderBy?: string | null): Promise<Row[]>
  summary(table?: string | null): Promise<SchemaMap>
}

export function createSchema(db: Db): Schema {
  let cache: SchemaMap | null = null
  let loading: Promise<SchemaMap> | null = null

  function load(force = false): Promise<SchemaMap> {
    if (force) cache = null
    if (cache) return Promise.resolve(cache)
    loading ??= (async () => {
      try {
        const schema: SchemaMap = {}
        for (const table of TABLES) {
          schema[table] = (await db.columns(table)).map(toColumn).filter((c) => c.name)
        }
        cache = schema
        return schema
      } finally {
        loading = null
      }
    })()
    return loading
  }

  async function selectColumns(table: string): Promise<ColumnInfo[]> {
    const columns = (await load())[table]
    if (!columns) throw new UnknownTableError(table)
    return columns.filter((column) => !isBinary(column))
  }

  async function selectAll(table: string, where: string, orderBy: string | null = null) {
    const list = (await selectColumns(table)).map((c) => quoteIdentifier(c.name)).join(', ')
    const sql =
      `SELECT ${list} FROM ${table} WHERE ${where}` + (orderBy ? ` ORDER BY ${orderBy}` : '')
    return db.query(sql)
  }

  async function summary(table: string | null = null): Promise<SchemaMap> {
    const schema = await load()
    if (!table) return schema
    const columns = schema[table]
    if (!columns) throw new UnknownTableError(table)
    return { [table]: columns }
  }

  return { load, selectColumns, selectAll, summary }
}

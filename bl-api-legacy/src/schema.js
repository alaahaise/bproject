'use strict';

const db = require('./db');

const TABLES = ['Mouvement', 'Ligne_MT', 'Tiers', 'Articles'];

// ODBC SQL type codes returned by connection.columns(). TYPE_NAME from this
// driver is unreliable (it reports CHAR for every column), DATA_TYPE is not.
const TYPE_NAMES = {
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
  93: 'SQL_TYPE_TIMESTAMP',
};

const BINARY_TYPES = new Set([-4, -3, -2]);

let cache = null;
let loading = null;

function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function isBinary(column) {
  return BINARY_TYPES.has(column.dataType) || /^IMAGE$/i.test(column.name);
}

async function load(force = false) {
  if (force) cache = null;
  if (cache) return cache;
  if (loading) return loading;

  loading = (async () => {
    const schema = {};
    for (const table of TABLES) {
      const rows = await db.columns(table);
      schema[table] = rows
        .map((row) => ({
          name: row.COLUMN_NAME,
          position: row.ORDINAL_POSITION,
          type: TYPE_NAMES[row.DATA_TYPE] || `SQL_${row.DATA_TYPE}`,
          dataType: row.DATA_TYPE,
          size: row.COLUMN_SIZE,
          nullable: row.IS_NULLABLE === 'YES',
          remarks: row.REMARKS ? String(row.REMARKS).trim() : null,
        }))
        .filter((column) => column.name);
    }

    cache = schema;
    return cache;
  })().finally(() => {
    loading = null;
  });

  return loading;
}

/**
 * Columns that can safely be selected. Binary columns (notably IMAGE) make
 * the HFSQL driver return zero rows, so they are excluded from full dumps.
 */
async function selectColumns(table) {
  const schema = await load();
  const columns = schema[table];

  if (!columns) {
    const error = new Error(`Unknown table: ${table}`);
    error.code = 'UNKNOWN_TABLE';
    throw error;
  }

  return columns.filter((column) => !isBinary(column));
}

async function selectList(table) {
  const columns = await selectColumns(table);
  return columns.map((column) => quoteIdentifier(column.name)).join(', ');
}

async function selectAll(table, where, orderBy = null) {
  const list = await selectList(table);
  const sql =
    `SELECT ${list} FROM ${table} WHERE ${where}` +
    (orderBy ? ` ORDER BY ${orderBy}` : '');
  return db.query(sql);
}

async function summary(table = null) {
  const schema = await load();

  if (table) {
    if (!schema[table]) {
      const error = new Error(`Unknown table: ${table}`);
      error.code = 'UNKNOWN_TABLE';
      throw error;
    }
    return { [table]: schema[table] };
  }

  return schema;
}

module.exports = {
  TABLES,
  load,
  selectColumns,
  selectList,
  selectAll,
  summary,
  quoteIdentifier,
};

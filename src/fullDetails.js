'use strict';

const config = require('./config');
const schema = require('./schema');
const { int } = require('./sql');

const DATE_TYPES = new Set(['SQL_DATE', 'SQL_TYPE_DATE']);
const TIMESTAMP_TYPES = new Set(['SQL_TIMESTAMP', 'SQL_TYPE_TIMESTAMP']);

function normalizeKey(key) {
  return String(key)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase();
}

function readColumn(row, name) {
  if (!row) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];

  const upper = name.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(row, upper)) return row[upper];

  const lower = name.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(row, lower)) return row[lower];

  const wanted = normalizeKey(name);
  for (const key of Object.keys(row)) {
    if (normalizeKey(key) === wanted) return row[key];
  }
  return undefined;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) &&
      value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatDateText(text) {
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }
  return text;
}

function formatTimestampText(text) {
  if (/^\d{14}$/.test(text)) {
    return (
      `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` +
      `T${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}`
    );
  }
  return text;
}

function normalizeValue(value, column) {
  if (value === null || value === undefined) return null;

  if (typeof value === 'bigint') {
    return toNumber(value);
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === 'object') {
    // Binary fields (IMAGE, ...) are not useful in JSON and can break the
    // driver when selected. They are already excluded from the SELECT list.
    return null;
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') return null;

    // HFSQL can return \x04 for empty/invalid dates. Do not expose that.
    if (/^[\x00-\x08\x0B\x0C\x0E-\x1F]+$/.test(text)) return null;

    if (DATE_TYPES.has(column.type)) return formatDateText(text);
    if (TIMESTAMP_TYPES.has(column.type)) return formatTimestampText(text);
    return text;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  return value;
}

function rowToObject(row, columns) {
  const result = {};

  for (const column of columns) {
    const value = normalizeValue(readColumn(row, column.name), column);
    if (value !== null) result[column.name] = value;
  }

  return result;
}

/**
 * Build a complete, non-empty dump of every column around one BL.
 *
 * `SELECT *` is unusable on Articles with this ODBC driver, so every query
 * uses an explicit column list from the HFSQL schema. Binary columns are
 * excluded. Empty values are omitted; /api/schema lists every column.
 */
async function getFullDetails(blId, clientId) {
  const [headerColumns, clientColumns, lineColumns] = await Promise.all([
    schema.selectColumns('Mouvement'),
    schema.selectColumns('Tiers'),
    schema.selectColumns('Ligne_MT'),
  ]);

  const headerRowsPromise = schema.selectAll(
    'Mouvement',
    `IDMOUVEMENT = ${int(blId)}`
  );

  const clientRowsPromise =
    clientId === null || clientId === undefined
      ? Promise.resolve([])
      : schema.selectAll('Tiers', `IDTIERS = ${int(clientId)}`);

  const lineRowsPromise = schema.selectAll(
    'Ligne_MT',
    `IDMOUVEMENT = ${int(blId)}
       AND TYPE = ${int(config.blType)}
       AND (SOUS_TABLE = 0 OR SOUS_TABLE IS NULL)`,
    'IDLIGNE_MT'
  );

  const [headerRows, clientRows, lineRows] = await Promise.all([
    headerRowsPromise,
    clientRowsPromise,
    lineRowsPromise,
  ]);

  const articleIds = [
    ...new Set(
      lineRows
        .map((row) => toNumber(readColumn(row, 'IDARTICLE')))
        .filter((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
    ),
  ];

  let articleColumns = [];
  let articleRows = [];

  if (articleIds.length) {
    articleColumns = await schema.selectColumns('Articles');
    articleRows = await schema.selectAll(
      'Articles',
      `IDARTICLE IN (${articleIds.map((id) => int(id)).join(', ')})`
    );
  }

  const articlesById = new Map();
  for (const row of articleRows) {
    const id = toNumber(readColumn(row, 'IDARTICLE'));
    if (id !== null) articlesById.set(id, rowToObject(row, articleColumns));
  }

  return {
    header: headerRows.length ? rowToObject(headerRows[0], headerColumns) : null,
    client: clientRows.length ? rowToObject(clientRows[0], clientColumns) : null,
    lines: lineRows.map((row) => {
      const articleId = toNumber(readColumn(row, 'IDARTICLE'));
      return {
        line: rowToObject(row, lineColumns),
        article:
          articleId !== null ? articlesById.get(articleId) || null : null,
      };
    }),
  };
}

module.exports = { getFullDetails };

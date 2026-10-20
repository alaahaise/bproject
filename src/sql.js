'use strict';

/**
 * Small helpers for building SQL safely.
 *
 * The HFSQL ODBC driver used by this project does not support parameter
 * markers (?), so all values have to be rendered into the statement. Only
 * values that passed strict validation (or came from the database itself)
 * are ever passed here.
 */

function quoteString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toSafeInt(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`Invalid integer value: ${value}`);
  }
  return number;
}

function int(value) {
  return String(toSafeInt(value));
}

module.exports = { quoteString, toSafeInt, int };

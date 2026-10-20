'use strict';

const odbc = require('odbc');
const config = require('./config');

let connection = null;
let queue = Promise.resolve();

async function open() {
  if (!connection) {
    connection = await odbc.connect(config.connectionString);
  }
  return connection;
}

/**
 * Run one SELECT and return a plain array of row objects.
 *
 * Queries are serialized because a single ODBC connection is shared. The
 * retry is safe here: every statement issued by this application is a SELECT.
 */
function query(sql) {
  const run = queue.then(async () => {
    const current = await open();
    try {
      const result = await current.query(sql);
      return Array.from(result);
    } catch (error) {
      const message = String((error && error.message) || error || '');
      const retryable =
        /connection|communication|link|socket|network|not connected|closed|eof|connexion|perdue|r[ée]seau/i.test(
          message
        );

      if (!retryable) throw error;

      // One reconnect attempt for a dropped connection.
      try {
        await current.close();
      } catch {
        /* ignore */
      }
      connection = null;
      const retried = await open();
      const result = await retried.query(sql);
      return Array.from(result);
    }
  });

  // Keep the chain alive even when a query fails.
  queue = run.catch(() => {});
  return run;
}

/**
 * Read ODBC column metadata for one table. Used to build explicit SELECT
 * lists; the HFSQL driver returns zero rows for SELECT * on Articles.
 */
function columns(table) {
  const run = queue.then(async () => {
    const current = await open();
    try {
      const result = await current.columns(null, null, table, null);
      return Array.from(result);
    } catch (error) {
      const message = String((error && error.message) || error || '');
      const retryable =
        /connection|communication|link|socket|network|not connected|closed|eof|connexion|perdue|r[ée]seau/i.test(
          message
        );

      if (!retryable) throw error;

      try {
        await current.close();
      } catch {
        /* ignore */
      }
      connection = null;
      const retried = await open();
      const result = await retried.columns(null, null, table, null);
      return Array.from(result);
    }
  });

  queue = run.catch(() => {});
  return run;
}

async function close() {
  if (connection) {
    const current = connection;
    connection = null;
    try {
      await current.close();
    } catch {
      /* ignore */
    }
  }
}

module.exports = { query, columns, close, open };

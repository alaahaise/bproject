'use strict';

const path = require('path');
const express = require('express');
const config = require('./config');
const db = require('./db');
const { parseBlInput, BadRequestError } = require('./numberParser');
const { getBl } = require('./blService');
const schema = require('./schema');

const app = express();

app.disable('x-powered-by');
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  const corsOrigin = process.env.CORS_ORIGIN;
  if (corsOrigin) {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(
      `${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms.toFixed(0)} ms)`
    );
  });
  next();
});

app.get('/api/health', async (req, res, next) => {
  try {
    const rows = await db.query('SELECT COUNT(*) AS n FROM Mouvement');
    res.json({
      ok: true,
      database: 'connected',
      movements: Number(rows[0] && rows[0].n),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/schema', async (req, res, next) => {
  try {
    const table = req.query.table ? String(req.query.table) : null;
    const tables = await schema.summary(table);
    res.json({ tables });
  } catch (error) {
    if (error.code === 'UNKNOWN_TABLE') {
      return res.status(400).json({
        error: 'unknown_table',
        message: error.message,
      });
    }
    return next(error);
  }
});

app.get('/api/bl/:number', async (req, res, next) => {
  try {
    const parsed = parseBlInput(req.params.number, req.query.year);
    const full = [req.query.full, req.query.all].some((value) =>
      ['1', 'true', 'yes', 'on'].includes(
        String(value || '').trim().toLowerCase()
      )
    );
    const result = await getBl(parsed, { full });

    if (!result) {
      return res.status(404).json({
        found: false,
        error: 'not_found',
        message: `Aucun BL trouvé pour "${req.params.number}".`,
      });
    }

    if (result.ambiguous) {
      return res.status(409).json({
        found: false,
        error: 'ambiguous_number',
        message:
          'Ce numéro de BL existe pour plusieurs années. Précisez l’année.',
        candidates: result.candidates,
      });
    }

    return res.json({ found: true, ...result });
  } catch (error) {
    return next(error);
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Unknown API route.' });
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  if (error instanceof BadRequestError) {
    return res.status(error.statusCode || 400).json({
      error: 'bad_request',
      message: error.message,
    });
  }

  console.error('Request failed:', error);
  return res.status(500).json({
    error: 'database_error',
    message: 'The database query failed.',
  });
});

let server = null;

function maskConnectionString(value) {
  return String(value || '').replace(
    /(PWD|PASSWORD|PWDXX)\s*=\s*[^;]*/gi,
    '$1=***'
  );
}

async function start() {
  await db.open();
  const onListening = () => {
    const host = config.host || 'localhost';
    console.log(`BL API listening on http://${host}:${config.port}`);
    console.log(`Database: ${maskConnectionString(process.env.HFSQL_CONN)}`);
  };
  server = config.host
    ? app.listen(config.port, config.host, onListening)
    : app.listen(config.port, onListening);
  return server;
}

async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await db.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start:', error);
    process.exit(1);
  });
}

module.exports = { app, start };

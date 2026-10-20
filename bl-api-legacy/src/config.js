'use strict';

require('dotenv').config({ quiet: true });

const config = {
  port: Number(process.env.PORT || 3100),
  host: process.env.HOST || '',
  connectionString: process.env.HFSQL_CONN || '',
  blType: Number(process.env.BL_TYPE || 23),
  articleCacheTtlMs: Number(process.env.ARTICLE_CACHE_TTL_MS || 60000),
};

if (!config.connectionString) {
  throw new Error(
    'HFSQL_CONN is not set. Copy .env.example to .env and configure the connection.'
  );
}

if (!Number.isInteger(config.blType)) {
  throw new Error('BL_TYPE must be an integer (the BL document type, normally 23).');
}

module.exports = config;

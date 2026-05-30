'use strict';

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || '';
if (!connectionString) {
  console.warn('DATABASE_URL is not set. Database calls will fail.');
}
const useSsl = connectionString && !connectionString.includes('localhost');

const pool = new Pool({
  connectionString: connectionString || undefined,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  query_timeout: 8000,
  idleTimeoutMillis: 10000,
  max: 5,
});

pool.on('connect', () => {
  console.info('PG pool connected');
});

pool.on('error', (err) => {
  console.error('PG pool error', err && err.message ? err.message : err);
});

module.exports = { pool };

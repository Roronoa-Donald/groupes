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
  connectionTimeoutMillis: 8000,
  query_timeout: 8000,
});

module.exports = { pool };

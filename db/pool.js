'use strict';

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || '';
const useSsl = connectionString && !connectionString.includes('localhost');

const pool = new Pool({
  connectionString: connectionString || undefined,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

module.exports = { pool };

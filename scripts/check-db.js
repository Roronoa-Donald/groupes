'use strict';

const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
});

const connectionString = process.env.DATABASE_URL || '';
const strictMode = String(process.env.DB_CHECK_STRICT || '').toLowerCase();
const shouldFail = strictMode === '1' || strictMode === 'true';

function getHost(url) {
  try {
    return new URL(url).host;
  } catch (err) {
    return '';
  }
}

async function main() {
  if (!connectionString) {
    console.log('DB check: DATABASE_URL is missing.');
    if (shouldFail) {
      process.exitCode = 1;
    }
    return;
  }

  const host = getHost(connectionString);
  const useSsl = connectionString && !connectionString.includes('localhost');

  console.log(`DB check: connecting${host ? ` to ${host}` : ''}...`);

  const pool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
    max: 1,
  });

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('DB check: success.');
  } catch (err) {
    const message = err && err.message ? err.message : 'unknown error';
    console.log(`DB check: failed (${message}).`);
    if (shouldFail) {
      process.exitCode = 1;
    }
  } finally {
    try {
      await pool.end();
    } catch (err) {
      // Ignore shutdown errors.
    }
  }
}

main().catch((err) => {
  const message = err && err.message ? err.message : 'unknown error';
  console.log(`DB check: fatal (${message}).`);
  if (shouldFail) {
    process.exit(1);
  }
});

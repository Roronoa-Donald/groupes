'use strict';

require('dotenv').config();
const path = require('path');
const Fastify = require('fastify');
const staticPlugin = require('@fastify/static');
const { pool } = require('./db/pool');
const { runMigrations } = require('./db/migrate');
const { runSeed } = require('./db/seed');

let initPromise;

async function ensureDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing');
  }
  if (!initPromise) {
    initPromise = (async () => {
      await runMigrations(pool);
      await runSeed(pool);
    })();
  }
  return initPromise;
}

function buildApp() {
  const app = Fastify({ logger: true, trustProxy: true });
  app.decorate('db', pool);

  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) {
      return;
    }
    await ensureDb();
  });

  app.register(staticPlugin, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
  });

  app.register(require('./routes/student'), { prefix: '/api/student' });
  app.register(require('./routes/admin'), { prefix: '/api/admin' });

  app.get('/health', async () => ({ ok: true }));

  return app;
}

if (require.main === module) {
  const app = buildApp();
  const port = Number(process.env.PORT || 3000);
  app.listen({ port, host: '0.0.0.0' }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}

module.exports = buildApp;

'use strict';

require('dotenv').config();
const path = require('path');
const Fastify = require('fastify');
const staticPlugin = require('@fastify/static');
const { pool } = require('./db/pool');
const { runMigrations } = require('./db/migrate');
const { runSeed } = require('./db/seed');

let initPromise;

function getLog(log) {
  return log || console;
}

async function ensureDb(log) {
  const logger = getLog(log);
  if (!process.env.DATABASE_URL) {
    logger.error('DATABASE_URL is missing');
    throw new Error('DATABASE_URL is missing');
  }
  if (!initPromise) {
    logger.info('DB init start');
    initPromise = (async () => {
      await runMigrations(pool);
      await runSeed(pool);
      logger.info('DB init done');
    })().catch((err) => {
      logger.error({ err: err.message }, 'DB init failed');
      throw err;
    });
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
    if (req.url.startsWith('/api/ping')) {
      return;
    }
    await ensureDb(app.log);
  });

  app.register(staticPlugin, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
  });

  app.get('/_auth/admin', async (req, reply) => {
    return reply.sendFile('admin.html');
  });

  app.register(require('./routes/student'), { prefix: '/api/student' });
  app.register(require('./routes/admin'), { prefix: '/api/admin' });

  app.get('/api/ping', async () => ({ ok: true, hasDb: Boolean(process.env.DATABASE_URL) }));
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

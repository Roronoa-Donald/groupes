'use strict';

const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '.env'),
  override: process.env.NODE_ENV !== 'production',
});
const Fastify = require('fastify');
const staticPlugin = require('@fastify/static');
const { pool } = require('./db/pool');

function buildApp() {
  const app = Fastify({ logger: true, trustProxy: true });
  app.decorate('db', pool);

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

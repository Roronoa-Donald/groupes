'use strict';

const serverless = require('serverless-http');
const buildApp = require('../server');

const app = buildApp();
const handler = serverless(app);
let readyPromise;

async function ensureReady() {
  if (!readyPromise) {
    const start = Date.now();
    console.log('[api] fastify ready start');
    readyPromise = app
      .ready()
      .then(() => {
        console.log(`[api] fastify ready done ${Date.now() - start}ms`);
      })
      .catch((err) => {
        const message = err && err.message ? err.message : 'unknown error';
        console.log(`[api] fastify ready error ${message}`);
        throw err;
      });
  }
  return readyPromise;
}

module.exports = async (req, res) => {
  const started = Date.now();
  const reqId =
    req.headers['x-vercel-id'] ||
    req.headers['x-request-id'] ||
    `local-${started}-${Math.random().toString(16).slice(2, 8)}`;

  console.log(`[api] start ${req.method} ${req.url} id=${reqId}`);
  const slowTimer = setTimeout(() => {
    console.log(`[api] slow >10s ${req.method} ${req.url} id=${reqId}`);
  }, 10000);

  res.on('finish', () => {
    clearTimeout(slowTimer);
    const ms = Date.now() - started;
    console.log(`[api] done ${req.method} ${req.url} ${res.statusCode} ${ms}ms id=${reqId}`);
  });
  res.on('close', () => {
    clearTimeout(slowTimer);
    if (!res.writableEnded) {
      const ms = Date.now() - started;
      console.log(`[api] closed ${req.method} ${req.url} ${ms}ms id=${reqId}`);
    }
  });

  return handler(req, res);
};

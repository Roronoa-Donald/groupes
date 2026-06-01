'use strict';

const serverless = require('serverless-http');
const buildApp = require('../server');

const app = buildApp();
const handler = serverless(app);

module.exports = async (req, res) => {
  const started = Date.now();
  const reqId = req.headers['x-vercel-id'] || `local-${started}`;

  console.log(`[api] 🚩 START ${req.method} ${req.url} id=${reqId}`);

  // WATCHDOG: Force une réponse si Fastify met plus de 16 secondes
  // pour éviter le 504 Gateway Timeout de Vercel
  const watchdog = setTimeout(() => {
    console.error(`[api] 🚨 WATCHDOG TRIGGERED: Request timed out after 16s id=${reqId}`);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end('Internal Server Error: API Gateway Timeout (Watchdog)');
    }
  }, 16000);

  res.on('finish', () => {
    clearTimeout(watchdog);
    const ms = Date.now() - started;
    console.log(`[api] ✅ DONE ${req.method} ${req.url} ${res.statusCode} ${ms}ms id=${reqId}`);
  });

  res.on('close', () => {
    clearTimeout(watchdog);
    if (!res.writableEnded) {
      console.log(`[api] ❌ CLOSED ${req.method} ${req.url} id=${reqId}`);
    }
  });

  try {
    console.log(`[api] ⚙️ Calling handler id=${reqId}`);
    return await handler(req, res);
  } catch (err) {
    clearTimeout(watchdog);
    console.error(`[api] 💥 HANDLER ERROR id=${reqId}:`, err);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  }
};

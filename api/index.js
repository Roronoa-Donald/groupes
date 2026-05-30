'use strict';

const serverless = require('serverless-http');
const buildApp = require('../server');

const app = buildApp();
const handler = serverless(app);

module.exports = async (req, res) => {
  await app.ready();
  return handler(req, res);
};

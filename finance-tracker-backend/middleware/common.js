/**
 * middleware/common.js — request-wide middleware.
 */
const crypto = require('crypto');
const logger = require('../lib/logger');
const env = require('../config/env');

/** Tags each request with an id (honouring an upstream X-Request-Id) and logs it. */
const requestId = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'debug';
    logger[level](`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode}`, { id: req.id, ms: Math.round(ms) });
  });
  next();
};

/**
 * Strips MongoDB operator keys (`$gt`, `a.b`) from request bodies so a JSON body
 * can never smuggle a query operator into a filter. Zod covers most routes; this
 * is the backstop for the ones that read req.body directly.
 */
const stripOperators = (value, depth = 0) => {
  if (depth > 20 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => stripOperators(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith('$') || k.includes('.')) continue;
    out[k] = stripOperators(v, depth + 1);
  }
  return out;
};
const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') req.body = stripOperators(req.body);
  next();
};

const notFound = (req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });

/** The single error funnel. Maps known error shapes to clean client messages. */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    message = Object.values(err.errors)[0]?.message || 'Validation failed.';
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}.`;
  } else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    message = `That ${field} already exists.`;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body is not valid JSON.';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large.';
  }

  if (status >= 500) {
    logger.error(err.message, { id: req.id, stack: env.isProd ? undefined : err.stack });
    if (env.isProd) message = 'Something went wrong. Please try again.';
  }
  res.status(status).json({ error: message, ...(err.details && { errors: err.details }), requestId: req.id });
};

module.exports = { requestId, sanitizeBody, notFound, errorHandler, stripOperators };

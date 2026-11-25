/**
 * app.js — the configured Express application (no listening, no DB connect).
 *
 * Imported by server.js (long-running host), api/index.js (Vercel serverless)
 * and the integration tests.
 */
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const { requestId, sanitizeBody, notFound, errorHandler } = require('./middleware/common');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(requestId);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // JSON API only; the web app sets its own CSP
}));
app.use(compression());

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Auth is a bearer token in a header, never a cookie, so the API is not exposed
// to CSRF (a cross-site request cannot attach the header). See docs/SECURITY.md.
const allowed = new Set(env.CORS_ORIGINS);
app.use(cors({
  origin(origin, cb) {
    // No Origin: native mobile apps, curl, server-to-server (the SMS forwarder).
    if (!origin || allowed.has(origin)) return cb(null, true);
    // Local development: any localhost port (Vite, Expo web, previews).
    if (!env.isProd && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Platform', 'X-Client-Device', 'X-Session-Id', 'X-Request-Id', 'Accept-Language'],
  exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
  maxAge: 600,
}));

// ─── Rate limits ──────────────────────────────────────────────────────────────
const limiter = (windowMs, max, message, keyGenerator) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  message: { error: message },
  skip: () => env.isTest,
  ...(keyGenerator && { keyGenerator }),
});
const authLimiter = limiter(15 * 60e3, 60, 'Too many attempts. Please try again in 15 minutes.');
const apiLimiter = limiter(60e3, 300, 'Too many requests. Please slow down.');
// Per webhook token, not per IP: one phone forwarding a burst of SMS is fine,
// a leaked token being hammered is not.
const webhookLimiter = limiter(60e3, 30, 'Too many SMS in a short time.', (req) => `sms:${req.params.token || req.path}`);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(sanitizeBody);

// ─── Health ───────────────────────────────────────────────────────────────────
const health = (req, res) => {
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  const db = states[mongoose.connection.readyState] || 'unknown';
  res.status(db === 'connected' ? 200 : 503).json({ status: db === 'connected' ? 'ok' : 'degraded', database: db, version: '3.0.0', timestamp: new Date().toISOString() });
};

// ─── Routes ───────────────────────────────────────────────────────────────────
const routes = {
  '/auth': require('./routes/auth'),
  '/transactions': require('./routes/transactions'),
  '/goals': require('./routes/goals'),
  '/budgets': require('./routes/budgets'),
  '/users': require('./routes/users'),
  '/subscriptions': require('./routes/subscriptions'),
  '/wallets': require('./routes/wallets'),
  '/categories': require('./routes/categories'),
  '/notifications': require('./routes/notifications'),
  '/insights': require('./routes/insights'),
  '/ai': require('./routes/ai'),
  '/mood': require('./routes/mood'),
  '/journal': require('./routes/journal'),
  '/streaks': require('./routes/streaks'),
  '/investments': require('./routes/investments'),
  '/wrapped': require('./routes/wrapped'),
  '/import': require('./routes/import'),
  '/family': require('./routes/family'),
  '/sms': require('./routes/sms'),
  '/challenges': require('./routes/challenges'),
  '/splits': require('./routes/splits'),
  '/meta': require('./routes/meta'),
};

const passport = require('./config/passport');
app.use(passport.initialize());

// Mounted at /api/v1 (canonical, for the mobile app and new clients) and /api
// (unversioned alias the existing web build uses).
for (const prefix of ['/api/v1', '/api']) {
  app.get(`${prefix}/health`, health);
  app.use(`${prefix}/auth`, authLimiter);
  app.use(`${prefix}/sms/webhook/:token`, webhookLimiter);
  app.use(prefix, apiLimiter);
  for (const [path, router] of Object.entries(routes)) app.use(prefix + path, router);
}

if (!env.isProd) {
  const { runRecurringJob } = require('./cron/recurringJob');
  const { runAllAlerts } = require('./cron/budgetAlertJob');
  const { runStreakJob } = require('./cron/streakJob');
  app.post('/api/admin/run-jobs', async (req, res) => {
    res.json({ recurring: await runRecurringJob(), alerts: await runAllAlerts(), streaks: await runStreakJob() });
  });
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;

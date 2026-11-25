/**
 * config/env.js — the one place environment variables are read and checked.
 *
 * Every other module imports `env` from here instead of touching process.env,
 * so a misconfigured deploy fails at boot with a precise message rather than
 * at the moment a user reaches the broken feature.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const bool = (v, d = false) => (v === undefined ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

const env = {
  NODE_ENV,
  isProd,
  isTest,
  PORT: Number(process.env.PORT) || 5000,
  MONGODB_URI: process.env.MONGODB_URI || '',

  // Auth. Access tokens are short-lived; sessions live on in rotating refresh tokens.
  JWT_SECRET: process.env.JWT_SECRET || (isProd ? '' : 'dev-only-insecure-secret-change-me'),
  ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL || '15m',
  REFRESH_TOKEN_DAYS: Number(process.env.REFRESH_TOKEN_DAYS) || 30,

  FRONTEND_URL: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, ''),
  BACKEND_URL: (process.env.BACKEND_URL || `http://localhost:${Number(process.env.PORT) || 5000}`).replace(/\/$/, ''),
  CORS_ORIGINS: [
    'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:8081', // Expo web
    // The production web app (the original server allowed it unconditionally;
    // kept so a missing env var can't lock the live site out).
    'https://personal-finance-tracker-jet-delta.vercel.app',
    ...list(process.env.CORS_ORIGIN),
    ...list(process.env.FRONTEND_URL),
  ],
  // Deep-link scheme the mobile app registers; OAuth may redirect back to it.
  MOBILE_SCHEME: process.env.MOBILE_SCHEME || 'clario',

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',

  BREVO_API_KEY: process.env.BREVO_API_KEY || '',
  EMAIL_USER: process.env.EMAIL_USER || '',
  EMAIL_PASS: process.env.EMAIL_PASS || '',

  // FX rates. The default provider needs no key; set FX_DISABLED=true for offline dev.
  FX_API_URL: process.env.FX_API_URL || 'https://open.er-api.com/v6/latest',
  FX_DISABLED: bool(process.env.FX_DISABLED, isTest),

  // Push notifications go through Expo's push service (no key needed for basic use).
  EXPO_PUSH_URL: process.env.EXPO_PUSH_URL || 'https://exp.host/--/api/v2/push/send',
  PUSH_DISABLED: bool(process.env.PUSH_DISABLED, isTest),

  RUN_CRON: bool(process.env.RUN_CRON, !isTest),
  LOG_LEVEL: process.env.LOG_LEVEL || (isTest ? 'silent' : isProd ? 'info' : 'debug'),
};

/** Throws on fatal misconfiguration; returns warnings for degraded features. */
env.check = () => {
  const fatal = [];
  if (!env.MONGODB_URI) fatal.push('MONGODB_URI is not set.');
  if (!env.JWT_SECRET) fatal.push('JWT_SECRET is not set.');
  if (fatal.length) {
    const err = new Error(`Configuration error:\n  • ${fatal.join('\n  • ')}`);
    err.fatal = true;
    throw err;
  }
  const warnings = [];
  if (isProd) {
    // Warn, don't refuse to boot: an existing deployment's secret must keep
    // working when this version is rolled out over it. Rotate it when convenient.
    if (env.JWT_SECRET.length < 32) warnings.push('JWT_SECRET is shorter than 32 characters — rotate it to a longer random value (signs everyone out once).');
    if (!process.env.BACKEND_URL) warnings.push('BACKEND_URL — SMS webhook URLs will point at localhost.');
    if (!process.env.FRONTEND_URL) warnings.push('FRONTEND_URL — reset and OAuth links will point at localhost.');
    if (!env.BREVO_API_KEY && !(env.EMAIL_USER && env.EMAIL_PASS)) warnings.push('BREVO_API_KEY or EMAIL_USER/EMAIL_PASS — password reset email is disabled.');
  }
  return warnings;
};

module.exports = env;

/**
 * lib/logger.js — tiny structured logger.
 *
 * JSON lines in production (so a log drain can index them), readable lines in
 * development, nothing in tests. Deliberately dependency-free.
 */
const env = require('../config/env');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const threshold = LEVELS[env.LOG_LEVEL] ?? LEVELS.info;

const write = (level, msg, meta) => {
  if (LEVELS[level] < threshold) return;
  const line = env.isProd
    ? JSON.stringify({ level, time: new Date().toISOString(), msg, ...meta })
    : `${new Date().toISOString().slice(11, 19)} ${level.toUpperCase().padEnd(5)} ${msg}${meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
};

module.exports = {
  debug: (msg, meta) => write('debug', msg, meta),
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
};

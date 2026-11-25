/**
 * services/fx.js — currency conversion.
 *
 * Rates are fetched once per UTC day from a keyless provider, cached in Mongo
 * and in memory. If the provider is down (or FX_DISABLED), the coarse table in
 * utils/currencies.js is used and the result is marked `approximate`.
 */
const env = require('../config/env');
const logger = require('../lib/logger');
const FxRate = require('../models/FxRate');
const { CURRENCIES, isSupported } = require('../utils/currencies');
const { HttpError } = require('../lib/http');

const memory = new Map(); // day -> { rates, live }

const today = () => new Date().toISOString().slice(0, 10);

const fallbackRates = () => {
  const rates = {};
  for (const [code, c] of Object.entries(CURRENCIES)) rates[code] = c.fallbackPerUSD;
  return rates;
};

const fetchLive = async () => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${env.FX_API_URL}/USD`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`FX provider HTTP ${res.status}`);
    const body = await res.json();
    const rates = body.rates || body.conversion_rates;
    if (!rates || typeof rates.INR !== 'number') throw new Error('FX provider returned no rates');
    return rates;
  } finally {
    clearTimeout(timer);
  }
};

/** Returns { rates (per USD), live } for today, from memory → Mongo → network → fallback. */
const getRates = async () => {
  const day = today();
  if (memory.has(day)) return memory.get(day);

  if (!env.FX_DISABLED) {
    try {
      const cached = await FxRate.findOne({ day }).lean();
      if (cached) {
        const entry = { rates: Object.fromEntries(Object.entries(cached.rates)), live: true };
        memory.set(day, entry);
        return entry;
      }
      const rates = await fetchLive();
      await FxRate.updateOne({ day }, { $set: { rates, source: env.FX_API_URL } }, { upsert: true });
      const entry = { rates, live: true };
      memory.set(day, entry);
      return entry;
    } catch (err) {
      logger.warn('FX rates unavailable, using fallback table', { err: err.message });
    }
  }
  const entry = { rates: fallbackRates(), live: false };
  memory.set(day, entry); // don't hammer a failing provider; retried tomorrow / on restart
  return entry;
};

/** Rate to multiply `from` amounts by to get `to` amounts. */
const rate = async (from, to) => {
  from = String(from).toUpperCase();
  to = String(to).toUpperCase();
  if (!isSupported(from) || !isSupported(to)) throw new HttpError(400, `Unsupported currency ${!isSupported(from) ? from : to}.`);
  if (from === to) return { rate: 1, approximate: false };
  const { rates, live } = await getRates();
  const r = rates[to] / rates[from];
  if (!Number.isFinite(r) || r <= 0) throw new HttpError(502, 'Exchange rate unavailable.');
  return { rate: r, approximate: !live };
};

const convert = async (amount, from, to) => {
  const { rate: r, approximate } = await rate(from, to);
  return { amount: Math.round(amount * r * 100) / 100, rate: r, approximate };
};

module.exports = { getRates, rate, convert, _memory: memory };

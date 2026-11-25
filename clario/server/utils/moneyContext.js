/**
 * utils/moneyContext.js — "which currency is this answer in?" for the
 * synchronous text generators (Mira, the legacy chat engine).
 *
 * Mira composes hundreds of strings through small helpers; threading a currency
 * argument through every one of them would touch every line. Because ask() is
 * synchronous, a scoped module-level value is safe: it is set, used and
 * restored within one call stack, with no await in between.
 */
const { CURRENCIES, formatMoney } = require('./currencies');

let current = 'INR';

const withCurrency = (code, fn) => {
  const prev = current;
  current = CURRENCIES[code] ? code : 'INR';
  try { return fn(); } finally { current = prev; }
};

const format = (n) => {
  const c = CURRENCIES[current];
  // Whole units read better in a chat answer; keep the symbol the user expects.
  const num = Math.round(n || 0).toLocaleString(c.locale);
  return `${c.symbol}${num}`;
};

const locale = () => CURRENCIES[current].locale;
const code = () => current;

module.exports = { withCurrency, format, locale, code, formatMoney };

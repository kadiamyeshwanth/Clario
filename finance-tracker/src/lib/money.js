/**
 * lib/money.js — the user's currency, everywhere a figure is shown.
 *
 * The original UI hard-coded "₹" and the en-IN locale in ~300 places. They
 * now call cs() (currency symbol) and nl() (number locale), which read the
 * signed-in user's base currency. Visual output for an INR user is unchanged.
 *
 * The value is module-level on purpose: it changes only when the user changes
 * their currency in Settings, which reloads the app.
 */
const CURRENCIES = {
  INR: { symbol: '₹', locale: 'en-IN', decimals: 2, indian: true },
  USD: { symbol: '$', locale: 'en-US', decimals: 2 },
  EUR: { symbol: '€', locale: 'de-DE', decimals: 2 },
  GBP: { symbol: '£', locale: 'en-GB', decimals: 2 },
  AED: { symbol: 'AED ', locale: 'en-AE', decimals: 2 },
  SGD: { symbol: 'S$', locale: 'en-SG', decimals: 2 },
  AUD: { symbol: 'A$', locale: 'en-AU', decimals: 2 },
  CAD: { symbol: 'C$', locale: 'en-CA', decimals: 2 },
  JPY: { symbol: '¥', locale: 'ja-JP', decimals: 0 },
  CNY: { symbol: '¥', locale: 'zh-CN', decimals: 2 },
  BRL: { symbol: 'R$', locale: 'pt-BR', decimals: 2 },
  MXN: { symbol: 'MX$', locale: 'es-MX', decimals: 2 },
  ZAR: { symbol: 'R', locale: 'en-ZA', decimals: 2 },
  NGN: { symbol: '₦', locale: 'en-NG', decimals: 2 },
  KES: { symbol: 'KSh ', locale: 'en-KE', decimals: 2 },
  BDT: { symbol: '৳', locale: 'en-BD', decimals: 2 },
  PKR: { symbol: '₨', locale: 'en-PK', decimals: 2 },
  LKR: { symbol: 'Rs ', locale: 'en-LK', decimals: 2 },
  NPR: { symbol: 'Rs ', locale: 'en-NP', decimals: 2 },
  IDR: { symbol: 'Rp', locale: 'id-ID', decimals: 0 },
  PHP: { symbol: '₱', locale: 'en-PH', decimals: 2 },
  CHF: { symbol: 'CHF ', locale: 'de-CH', decimals: 2 },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES);

const read = () => {
  try {
    const u = JSON.parse(localStorage.getItem('finance_user') || 'null');
    const c = u?.preferences?.currency;
    return CURRENCIES[c] ? c : 'INR';
  } catch { return 'INR'; }
};

let current = read();

/** Called by AuthContext whenever the signed-in user (or their prefs) change. */
export const setCurrency = (code) => { if (CURRENCIES[code]) current = code; };
export const currencyCode = () => current;

/** Currency symbol, e.g. "₹", "$", "€". */
export const cs = () => CURRENCIES[current].symbol;
/** Locale used for digit grouping, e.g. "en-IN" (1,00,000) vs "en-US" (100,000). */
export const nl = () => CURRENCIES[current].locale;

/** Full formatted amount: money(1234.5) → "₹1,235" (whole units, like the original UI). */
export const money = (n, { decimals = 0, sign = false } = {}) => {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString(nl(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${sign && v < 0 ? '−' : ''}${cs()}${s}`;
};

/** Compact label: ₹1.2L / ₹93k for INR; $1.2M / $93k elsewhere. */
export const short = (n) => {
  const v = Math.abs(Number(n) || 0);
  const sym = cs();
  if (CURRENCIES[current].indian) {
    if (v >= 1e7) return `${sym}${(v / 1e7).toFixed(1)}Cr`;
    if (v >= 1e5) return `${sym}${(v / 1e5).toFixed(1)}L`;
  } else {
    if (v >= 1e9) return `${sym}${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `${sym}${(v / 1e6).toFixed(1)}M`;
  }
  if (v >= 1e3) return `${sym}${Math.round(v / 1e3)}k`;
  return `${sym}${Math.round(v)}`;
};

/** Amount in another currency, with its own symbol (for foreign-currency rows). */
export const moneyIn = (n, code) => {
  const c = CURRENCIES[code] || CURRENCIES[current];
  return `${c.symbol}${Math.abs(Number(n) || 0).toLocaleString(c.locale, { maximumFractionDigits: c.decimals })}`;
};

/**
 * money.js — formats amounts in the user's base currency (same rules as web).
 */
const C = {
  INR: ['₹', 'en-IN', 2], USD: ['$', 'en-US', 2], EUR: ['€', 'de-DE', 2], GBP: ['£', 'en-GB', 2], AED: ['AED ', 'en-AE', 2],
  SGD: ['S$', 'en-SG', 2], AUD: ['A$', 'en-AU', 2], CAD: ['C$', 'en-CA', 2], JPY: ['¥', 'ja-JP', 0], CNY: ['¥', 'zh-CN', 2],
  BRL: ['R$', 'pt-BR', 2], MXN: ['MX$', 'es-MX', 2], ZAR: ['R', 'en-ZA', 2], NGN: ['₦', 'en-NG', 2], KES: ['KSh ', 'en-KE', 2],
  BDT: ['৳', 'en-BD', 2], PKR: ['₨', 'en-PK', 2], LKR: ['Rs ', 'en-LK', 2], NPR: ['Rs ', 'en-NP', 2], IDR: ['Rp', 'id-ID', 0],
  PHP: ['₱', 'en-PH', 2], CHF: ['CHF ', 'de-CH', 2],
};
export const CURRENCY_CODES = Object.keys(C);

let current = 'INR';
export const setCurrency = (code) => { if (C[code]) current = code; };
export const currencyCode = () => current;
export const symbol = (code = current) => (C[code] || C.INR)[0];

const group = (n, locale, decimals) => {
  try { return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
  catch { return n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
};

/** money(1234.5) → "₹1,235"; money(-20, { sign: true }) → "−₹20". */
export const money = (n, { code = current, decimals = 0, sign = false } = {}) => {
  const [sym, locale, d] = C[code] || C.INR;
  const v = Number(n) || 0;
  return `${sign && v < 0 ? '−' : ''}${sym}${group(Math.abs(v), locale, Math.min(decimals, d))}`;
};

export const short = (n, code = current) => {
  const v = Math.abs(Number(n) || 0);
  const s = symbol(code);
  if (code === 'INR') {
    if (v >= 1e7) return `${s}${(v / 1e7).toFixed(1)}Cr`;
    if (v >= 1e5) return `${s}${(v / 1e5).toFixed(1)}L`;
  } else if (v >= 1e6) return `${s}${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${s}${Math.round(v / 1e3)}k`;
  return `${s}${Math.round(v)}`;
};

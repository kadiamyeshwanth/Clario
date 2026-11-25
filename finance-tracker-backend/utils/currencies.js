/**
 * utils/currencies.js — the currencies Clario supports and how to show them.
 *
 * `fallbackPerUSD` is a coarse rate table used only when the live FX provider is
 * unreachable, so a conversion degrades to "approximately right" instead of
 * failing the request. Live rates always win when available.
 */
const CURRENCIES = {
  INR: { symbol: '₹',  name: 'Indian Rupee',       locale: 'en-IN', decimals: 2, fallbackPerUSD: 83.5 },
  USD: { symbol: '$',  name: 'US Dollar',          locale: 'en-US', decimals: 2, fallbackPerUSD: 1 },
  EUR: { symbol: '€',  name: 'Euro',               locale: 'de-DE', decimals: 2, fallbackPerUSD: 0.92 },
  GBP: { symbol: '£',  name: 'British Pound',      locale: 'en-GB', decimals: 2, fallbackPerUSD: 0.79 },
  AED: { symbol: 'د.إ', name: 'UAE Dirham',        locale: 'en-AE', decimals: 2, fallbackPerUSD: 3.67 },
  SGD: { symbol: 'S$', name: 'Singapore Dollar',   locale: 'en-SG', decimals: 2, fallbackPerUSD: 1.34 },
  AUD: { symbol: 'A$', name: 'Australian Dollar',  locale: 'en-AU', decimals: 2, fallbackPerUSD: 1.52 },
  CAD: { symbol: 'C$', name: 'Canadian Dollar',    locale: 'en-CA', decimals: 2, fallbackPerUSD: 1.36 },
  JPY: { symbol: '¥',  name: 'Japanese Yen',       locale: 'ja-JP', decimals: 0, fallbackPerUSD: 150 },
  CNY: { symbol: '¥',  name: 'Chinese Yuan',       locale: 'zh-CN', decimals: 2, fallbackPerUSD: 7.2 },
  BRL: { symbol: 'R$', name: 'Brazilian Real',     locale: 'pt-BR', decimals: 2, fallbackPerUSD: 5.0 },
  MXN: { symbol: '$',  name: 'Mexican Peso',       locale: 'es-MX', decimals: 2, fallbackPerUSD: 17.0 },
  ZAR: { symbol: 'R',  name: 'South African Rand', locale: 'en-ZA', decimals: 2, fallbackPerUSD: 18.5 },
  NGN: { symbol: '₦',  name: 'Nigerian Naira',     locale: 'en-NG', decimals: 2, fallbackPerUSD: 1500 },
  KES: { symbol: 'KSh', name: 'Kenyan Shilling',   locale: 'en-KE', decimals: 2, fallbackPerUSD: 130 },
  BDT: { symbol: '৳',  name: 'Bangladeshi Taka',   locale: 'bn-BD', decimals: 2, fallbackPerUSD: 110 },
  PKR: { symbol: '₨',  name: 'Pakistani Rupee',    locale: 'en-PK', decimals: 2, fallbackPerUSD: 280 },
  LKR: { symbol: 'Rs', name: 'Sri Lankan Rupee',   locale: 'en-LK', decimals: 2, fallbackPerUSD: 300 },
  NPR: { symbol: 'Rs', name: 'Nepalese Rupee',     locale: 'en-NP', decimals: 2, fallbackPerUSD: 133 },
  IDR: { symbol: 'Rp', name: 'Indonesian Rupiah',  locale: 'id-ID', decimals: 0, fallbackPerUSD: 15800 },
  PHP: { symbol: '₱',  name: 'Philippine Peso',    locale: 'en-PH', decimals: 2, fallbackPerUSD: 56 },
  CHF: { symbol: 'CHF', name: 'Swiss Franc',       locale: 'de-CH', decimals: 2, fallbackPerUSD: 0.88 },
};

const SUPPORTED_CURRENCIES = Object.keys(CURRENCIES);

const isSupported = (code) => SUPPORTED_CURRENCIES.includes(String(code || '').toUpperCase());

/** Formats an amount for messages composed on the server (notifications, Mira). */
const formatMoney = (amount, currency = 'INR') => {
  const c = CURRENCIES[currency] || CURRENCIES.INR;
  try {
    return new Intl.NumberFormat(c.locale, {
      style: 'currency', currency, maximumFractionDigits: c.decimals === 0 ? 0 : (Math.abs(amount) >= 100 ? 0 : 2),
    }).format(amount || 0);
  } catch {
    return `${c.symbol}${Math.round(amount || 0).toLocaleString('en-US')}`;
  }
};

module.exports = { CURRENCIES, SUPPORTED_CURRENCIES, isSupported, formatMoney };

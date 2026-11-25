import apiClient, { tokenStore } from './client';
import { nl } from '@/lib/money';

/** Browser's own currency/timezone/language guess, sent once at sign-up. */
const detectPreferences = () => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = navigator.language || nl();
  const language = locale.slice(0, 2);
  const region = (locale.split('-')[1] || '').toUpperCase();
  const byRegion = {
    IN: 'INR', US: 'USD', GB: 'GBP', AE: 'AED', SG: 'SGD', AU: 'AUD', CA: 'CAD', JP: 'JPY', CN: 'CNY', BR: 'BRL',
    MX: 'MXN', ZA: 'ZAR', NG: 'NGN', KE: 'KES', BD: 'BDT', PK: 'PKR', LK: 'LKR', NP: 'NPR', ID: 'IDR', PH: 'PHP', CH: 'CHF',
    DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', PT: 'EUR', IE: 'EUR', BE: 'EUR', AT: 'EUR', FI: 'EUR',
  };
  const currency = byRegion[region] || (timezone === 'Asia/Kolkata' || timezone === 'Asia/Calcutta' ? 'INR' : undefined);
  return { timezone, language, locale: /^[a-z]{2}-[A-Z]{2}$/.test(locale) ? locale : undefined, currency };
};

export const registerUser = async ({ username, email, password }) => {
  const { data } = await apiClient.post('/auth/register', { username, email, password, ...detectPreferences() });
  return data; // { message, user, accessToken, refreshToken, sessionId }
};

export const loginUser = async ({ username, password }) => {
  const { data } = await apiClient.post('/auth/login', { username, password });
  return data;
};

export const getMe = async () => {
  const { data } = await apiClient.get('/auth/me');
  return data; // { user }
};

export const exchangeOAuthCode = async (code) => {
  const { data } = await apiClient.post('/auth/oauth/exchange', { code });
  return data;
};

export const logoutSession = async () => {
  const refreshToken = tokenStore.refresh;
  if (refreshToken) await apiClient.post('/auth/logout', { refreshToken }).catch(() => {});
};

export const fetchSessions = async () => (await apiClient.get('/auth/sessions')).data;
export const revokeSession = async (id) => (await apiClient.delete(`/auth/sessions/${id}`)).data;
export const logoutAll = async () => (await apiClient.post('/auth/logout-all')).data;

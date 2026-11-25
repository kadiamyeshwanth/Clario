import axios from 'axios';

/**
 * API client.
 *
 * Access tokens live 15 minutes. When one expires, the first request that hits
 * the 401 transparently exchanges the refresh token for a new pair and retries;
 * concurrent requests wait on that single refresh instead of each starting one.
 * Only when the refresh itself fails is the user sent back to the login page.
 */
const KEYS = { access: 'finance_token', refresh: 'finance_refresh', session: 'finance_session', user: 'finance_user' };

export const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const apiClient = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'web' },
  timeout: 30000,
});

export const tokenStore = {
  get access() { return localStorage.getItem(KEYS.access); },
  get refresh() { return localStorage.getItem(KEYS.refresh); },
  get session() { return localStorage.getItem(KEYS.session); },
  save({ accessToken, token, refreshToken, sessionId }) {
    const a = accessToken || token;
    if (a) localStorage.setItem(KEYS.access, a);
    if (refreshToken) localStorage.setItem(KEYS.refresh, refreshToken);
    if (sessionId) localStorage.setItem(KEYS.session, sessionId);
  },
  clear() { Object.values(KEYS).forEach((k) => localStorage.removeItem(k)); },
};

apiClient.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const sid = tokenStore.session;
  if (sid) config.headers['X-Session-Id'] = sid;
  return config;
});

let refreshing = null;
const refreshTokens = () => {
  if (!refreshing) {
    const refreshToken = tokenStore.refresh;
    refreshing = (refreshToken
      ? axios.post(`${baseURL}/auth/refresh`, { refreshToken }, { headers: { 'X-Client-Platform': 'web' } })
      : Promise.reject(new Error('no refresh token')))
      .then(({ data }) => {
        tokenStore.save(data);
        if (data.user) localStorage.setItem(KEYS.user, JSON.stringify(data.user));
        return data.accessToken;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
};

const sendToLogin = () => {
  tokenStore.clear();
  if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    const isAuthCall = /\/auth\/(login|register|refresh|forgot-password|reset-password|oauth)/.test(original.url || '');

    if (status === 401 && !isAuthCall && !original._retried) {
      original._retried = true;
      try {
        const token = await refreshTokens();
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return apiClient(original);
      } catch {
        sendToLogin();
      }
    }
    // Friendlier message when the server is unreachable (offline, cold start).
    if (!error.response) {
      error.message = navigator.onLine === false
        ? 'You are offline. Check your connection and try again.'
        : 'Could not reach Clario. Please try again in a moment.';
    }
    return Promise.reject(error);
  }
);

export default apiClient;

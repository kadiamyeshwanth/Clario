/**
 * api.js — talks to the Clario API (/api/v1).
 *
 * Same session model as the web app: a 15-minute access token, a rotating
 * refresh token kept in the secure store. A 401 triggers one shared refresh;
 * if that fails the app returns to sign-in.
 *
 * API base URL, in order: EXPO_PUBLIC_API_URL → app.json extra.apiUrl.
 * (On the Android emulator, "localhost" is the emulator itself — use
 *  http://10.0.2.2:5000/api/v1 or your machine's LAN IP.)
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { secure } from './storage';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || 'http://localhost:5000/api/v1').replace(/\/$/, '');

const KEYS = { access: 'clario.access', refresh: 'clario.refresh', session: 'clario.session' };

let accessToken = null;
let sessionId = null;
let onSignedOut = () => {};
export const setSignedOutHandler = (fn) => { onSignedOut = fn; };

export const tokens = {
  async load() {
    accessToken = await secure.get(KEYS.access);
    sessionId = await secure.get(KEYS.session);
    return !!accessToken;
  },
  async save({ accessToken: a, token, refreshToken, sessionId: s }) {
    accessToken = a || token || accessToken;
    if (accessToken) await secure.set(KEYS.access, accessToken);
    if (refreshToken) await secure.set(KEYS.refresh, refreshToken);
    if (s) { sessionId = String(s); await secure.set(KEYS.session, sessionId); }
  },
  async clear() {
    accessToken = null; sessionId = null;
    await Promise.all(Object.values(KEYS).map((k) => secure.del(k)));
  },
  refresh: () => secure.get(KEYS.refresh),
};

export class ApiError extends Error {
  constructor(status, message, body) { super(message); this.status = status; this.body = body; }
}

const baseHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Client-Platform': Platform.OS === 'web' ? 'web' : Platform.OS,
  'X-Client-Device': `Clario ${Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web'} app`,
  ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
  ...(sessionId && { 'X-Session-Id': sessionId }),
});

let refreshing = null;
const refresh = () => {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = await tokens.refresh();
      if (!refreshToken) throw new ApiError(401, 'Signed out');
      let res;
      try {
        res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', headers: baseHeaders(), body: JSON.stringify({ refreshToken }) });
      } catch {
        // No connection is not a rejected session: keep the tokens and retry later.
        throw new ApiError(0, 'Can’t reach Clario. Check your connection.');
      }
      if (res.status >= 500) throw new ApiError(0, 'Clario is unavailable right now. Try again shortly.');
      if (!res.ok) throw new ApiError(401, 'Session expired');
      await tokens.save(await res.json());
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
};

export const request = async (method, path, body, { retried = false, timeout = 20000 } = {}) => {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method, headers: baseHeaders(), body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout ? AbortSignal.timeout(timeout) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Can’t reach Clario. Check your connection.');
  }
  const isAuth = /^\/auth\/(login|register|refresh|forgot-password|oauth)/.test(path);
  if (res.status === 401 && !isAuth && !retried) {
    try {
      await refresh();
    } catch (err) {
      if (err?.status === 0) throw err; // offline: stay signed in
      await tokens.clear();
      onSignedOut();
      throw new ApiError(401, 'Please sign in again.');
    }
    return request(method, path, body, { retried: true, timeout });
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data);
  return data;
};

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  patch: (p, b) => request('PATCH', p, b ?? {}),
  del: (p, b) => request('DELETE', p, b),
};

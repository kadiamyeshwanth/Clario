/**
 * auth.js — session state for the app.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getLocales, getCalendars } from 'expo-localization';
import { api, tokens, setSignedOutHandler } from './api';
import { setCurrency } from './money';
import { setLanguage } from './i18n';
import { registerForPush, unregisterPush } from './push';
import { clearCache } from './query';
import { plain } from './storage';
import * as SmsImport from '../../modules/clario-sms';

const USER_KEY = 'clario.user';

const AuthContext = createContext(null);

const apply = (user) => {
  if (user?.preferences?.currency) setCurrency(user.preferences.currency);
  if (user?.preferences?.language) setLanguage(user.preferences.language);
};

/** Phone's own currency, timezone and language, sent once at sign-up. */
const devicePreferences = () => {
  const loc = getLocales()[0] || {};
  const cal = getCalendars()[0] || {};
  return {
    currency: loc.currencyCode || undefined,
    timezone: cal.timeZone || undefined,
    language: loc.languageCode || undefined,
    locale: loc.languageTag && /^[a-z]{2,3}-[A-Z]{2}$/.test(loc.languageTag) ? loc.languageTag : undefined,
  };
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const signOutLocal = useCallback(async () => {
    await tokens.clear();
    await plain.del(USER_KEY);
    await clearCache();
    setUser(null);
  }, []);

  useEffect(() => {
    setSignedOutHandler(() => { clearCache().catch(() => {}); setUser(null); });
    (async () => {
      try {
        if (await tokens.load()) {
          const { user: u } = await api.get('/auth/me');
          apply(u);
          setUser(u);
          await plain.set(USER_KEY, u);
          registerForPush().catch(() => {});
        }
      } catch (err) {
        // Only the server saying "this session is invalid" signs you out. No
        // signal at launch (lift, flight, USB unplugged during testing) used to
        // wipe the session too — now the app opens with the last-known account
        // and syncs when the connection returns.
        if (err?.status === 0) {
          const cached = await plain.get(USER_KEY);
          if (cached) { apply(cached); setUser(cached); }
        } else {
          await tokens.clear();
          await plain.del(USER_KEY);
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const finish = async (data) => {
    await tokens.save(data);
    apply(data.user);
    setUser(data.user);
    await plain.set(USER_KEY, data.user);
    registerForPush().catch(() => {});
  };

  const value = {
    user,
    ready,
    signIn: async (username, password) => finish(await api.post('/auth/login', { username: username.trim(), password })),
    signUp: async (username, email, password) => finish(await api.post('/auth/register', { username: username.trim(), email: email.trim(), password, ...devicePreferences() })),
    completeOAuth: async (code) => finish(await api.post('/auth/oauth/exchange', { code })),
    forgotPassword: (email) => api.post('/auth/forgot-password', { email: email.trim() }),
    signOut: async () => {
      await unregisterPush().catch(() => {});
      // Stop forwarding bank SMS: the next person to sign in on this phone must
      // never receive this account's messages (or vice versa).
      await SmsImport.configure('', false).catch(() => {});
      const refreshToken = await tokens.refresh();
      if (refreshToken) await api.post('/auth/logout', { refreshToken }).catch(() => {});
      await signOutLocal();
    },
    updateUser: (u) => { apply(u); setUser(u); plain.set(USER_KEY, u).catch(() => {}); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loginUser, registerUser, getMe, logoutSession, exchangeOAuthCode } from '../api/auth';
import { tokenStore } from '../api/client';
import { setCurrency } from '../lib/money';
import { setLanguage } from '../lib/i18n';

export const AuthContext = createContext(null);

const getSavedUser = () => {
  try {
    const raw = localStorage.getItem('finance_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const applyPreferences = (user) => {
  if (user?.preferences?.currency) setCurrency(user.preferences.currency);
  if (user?.preferences?.language) setLanguage(user.preferences.language);
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => { const u = getSavedUser(); applyPreferences(u); return u; });
  const [token, setToken] = useState(() => tokenStore.access);
  const [isVerifying, setIsVerifying] = useState(!!tokenStore.access);

  const _clearAuth = useCallback(() => {
    setCurrentUser(null);
    setToken(null);
    tokenStore.clear();
  }, []);

  /** Replace the cached user (e.g. after saving preferences). */
  const updateUser = useCallback((user) => {
    setCurrentUser(user);
    applyPreferences(user);
    localStorage.setItem('finance_user', JSON.stringify(user));
  }, []);

  // Verify the stored session on load. getMe() refreshes an expired access
  // token automatically (see api/client.js), so a returning user is not
  // bounced to the login page just because 15 minutes have passed.
  useEffect(() => {
    if (!tokenStore.access) { setIsVerifying(false); return; }
    getMe()
      .then(({ user }) => { updateUser(user); setToken(tokenStore.access); })
      .catch(() => _clearAuth())
      .finally(() => setIsVerifying(false));
  }, [_clearAuth, updateUser]);

  const _setAuth = (data) => {
    tokenStore.save(data);
    setToken(data.accessToken || data.token);
    updateUser(data.user);
  };

  const login = async (username, password) => {
    const data = await loginUser({ username, password });
    _setAuth(data);
    return data;
  };

  const register = async (username, email, password) => {
    const data = await registerUser({ username, email, password });
    _setAuth(data);
    return data;
  };

  const completeOAuth = async (code) => {
    const data = await exchangeOAuthCode(code);
    _setAuth(data);
    return data;
  };

  const logout = async () => {
    await logoutSession();
    _clearAuth();
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      token,
      isLoggedIn: !!currentUser,
      isVerifying,
      login,
      register,
      completeOAuth,
      updateUser,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};

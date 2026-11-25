import apiClient from './client';

// ── Get user stats (for Settings page) ──────────────────────────────────────
export const getUserStats = async () => {
  const { data } = await apiClient.get('/users/stats');
  return data;
};

// ── Update profile (username) ────────────────────────────────────────────────
export const updateProfile = async (payload) => {
  const { data } = await apiClient.patch('/users/profile', payload);
  return data;
};

// ── Change password ──────────────────────────────────────────────────────────
export const changePassword = async (payload) => {
  const { data } = await apiClient.patch('/users/password', payload);
  return data;
};

// ── Delete entire account + all data ────────────────────────────────────────
export const deleteAccount = async (password) => {
  const { data } = await apiClient.delete('/users/account', { data: { password } });
  return data;
};

// ── Preferences: currency, language, timezone, notifications ────────────────
export const getPreferences = async () => (await apiClient.get('/users/preferences')).data;
export const savePreferences = async (payload) => (await apiClient.patch('/users/preferences', payload)).data;

// ── Full JSON export (data portability) ─────────────────────────────────────
const download = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export const exportAllData = async () => {
  const { data } = await apiClient.get('/users/export');
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `clario-export-${new Date().toISOString().slice(0, 10)}.json`);
};
export const exportTransactionsCsv = async () => {
  const { data } = await apiClient.get('/transactions/export.csv', { responseType: 'blob' });
  download(data, `clario-transactions-${new Date().toISOString().slice(0, 10)}.csv`);
};

// ── Clear all data (keep account) ───────────────────────────────────────────
export const clearAllData = async () => {
  const { data } = await apiClient.delete('/users/data');
  return data;
};

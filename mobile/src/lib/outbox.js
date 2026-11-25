/**
 * outbox.js — add transactions with no signal.
 *
 * Logging a coffee shouldn't fail because the café has no signal. If a create
 * can't reach the server it is kept here with a stable clientId and retried
 * later; the server treats a repeated clientId as the same transaction, so a
 * retry can never double-post.
 */
import { AppState } from 'react-native';
import { api, ApiError } from './api';
import { plain } from './storage';
import { queryClient } from './query';

const KEY = 'clario.outbox';

export const newClientId = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const pending = () => plain.get(KEY, []);

/** Creates a transaction; on a network failure queues it and returns { queued: true }. */
export const createTransaction = async (payload) => {
  const body = { ...payload, clientId: payload.clientId || newClientId() };
  try {
    return { transaction: (await api.post('/transactions', body)).transaction, queued: false };
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) {
      const list = await pending();
      await plain.set(KEY, [...list, body]);
      return { queued: true };
    }
    throw err;
  }
};

let flushing = false;
export const flushOutbox = async () => {
  if (flushing) return 0;
  flushing = true;
  try {
    const list = await pending();
    if (!list.length) return 0;
    const left = [];
    let sent = 0;
    for (const item of list) {
      try { await api.post('/transactions', item); sent++; }
      catch (err) { if (err.status === 0) left.push(item); /* 4xx: drop — it will never succeed */ }
    }
    await plain.set(KEY, left);
    if (sent) {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
    }
    return sent;
  } finally {
    flushing = false;
  }
};

AppState.addEventListener('change', (s) => { if (s === 'active') flushOutbox().catch(() => {}); });

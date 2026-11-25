/**
 * services/notify.js — in-app notifications, mirrored to push when wanted.
 *
 * `kind` + `dedupeKey` stop the cron jobs from sending the same alert twice:
 * a notification with the same key inside the dedupe window is skipped.
 */
const Notification = require('../models/Notification');
const PushToken = require('../models/PushToken');
const User = require('../models/User');
const env = require('../config/env');
const logger = require('../lib/logger');

/** Sends to Expo's push service. Invalid tokens are pruned. */
const sendPush = async (userId, { title, body, link }) => {
  if (env.PUSH_DISABLED) return { sent: 0 };
  const tokens = await PushToken.find({ userId }).lean();
  if (!tokens.length) return { sent: 0 };
  const messages = tokens.map((t) => ({ to: t.token, title, body, sound: 'default', data: { link } }));
  try {
    const res = await fetch(env.EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json().catch(() => ({}));
    const results = Array.isArray(json.data) ? json.data : [];
    const dead = results
      .map((r, i) => (r.status === 'error' && r.details?.error === 'DeviceNotRegistered' ? tokens[i].token : null))
      .filter(Boolean);
    if (dead.length) await PushToken.deleteMany({ token: { $in: dead } });
    return { sent: results.filter((r) => r.status === 'ok').length };
  } catch (err) {
    logger.warn('push send failed', { err: err.message });
    return { sent: 0 };
  }
};

/**
 * Creates a notification. Options:
 *   kind       — preference gate: 'budget' | 'bill' | 'digest' | 'challenge' | 'anomaly' | 'split'
 *   dedupeKey  — skip if one with this key exists within dedupeHours (default 20)
 *   push       — also push to phones (default true)
 */
const notify = async (userId, { title, body, type = 'info', icon = '', link = '', kind = 'general', dedupeKey, dedupeHours = 20, push = true }) => {
  if (dedupeKey) {
    const since = new Date(Date.now() - dedupeHours * 3600e3);
    const exists = await Notification.exists({ userId, dedupeKey, createdAt: { $gte: since } });
    if (exists) return null;
  }

  let prefs = null;
  if (kind !== 'general' || push) {
    const u = await User.findById(userId).select('preferences.notifications').lean();
    prefs = u?.preferences?.notifications || {};
  }
  const gate = { budget: 'budgetAlerts', bill: 'billReminders', digest: 'weeklyDigest' }[kind];
  if (gate && prefs && prefs[gate] === false) return null;

  const n = await Notification.create({ userId, title, body, type, icon, link, kind, dedupeKey });
  if (push && prefs?.push !== false) await sendPush(userId, { title, body, link });
  return n;
};

module.exports = { notify, sendPush };

/**
 * routes/sms.js — bank / UPI SMS → transactions.
 *
 * Two ways in, one pipeline (importSms):
 *   POST /api/sms/webhook/:token   live SMS from the phone (Clario app on Android, or the
 *                                  standalone forwarder / Tasker / MacroDroid). No JWT:
 *                                  the per-user token in the URL authenticates it, so it
 *                                  works from a background receiver with the app closed.
 *   POST /api/sms/import           (JWT) a batch read from the phone's inbox — "import my
 *                                  last 30 days" on first setup.
 *
 *   GET  /api/sms/setup            webhook URL + token (created on first call)
 *   POST /api/sms/token/regenerate rotate the token
 *   GET  /api/sms/history          last 30 SMS-imported transactions
 *
 * Every SMS gets a fingerprint (sender + text), so the same message arriving
 * live and again in a backfill — or forwarded twice — becomes one transaction.
 */
const router = require('express').Router();
const crypto = require('crypto');
const protect = require('../middleware/protect');
const env = require('../config/env');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { parseSms, isBankSender, balanceOf } = require('../utils/smsParser');
const { createTransaction } = require('../services/ledger');
const { HttpError } = require('../lib/http');
const logger = require('../lib/logger');

const genToken = () => crypto.randomBytes(24).toString('hex');
const webhookUrlFor = (token) => `${env.BACKEND_URL}/api/sms/webhook/${token}`;

const toDate = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;
  const d = new Date(Number(raw) || raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Parses one SMS and records it. Returns { status: 'created'|'duplicate'|'skipped', reason?, transactionId? }.
 * `receivedAt` is when the phone got it (the SMS text usually has only a date).
 */
const importSms = async (user, { text, sender = '', receivedAt }) => {
  const smsText = String(text || '').trim().slice(0, 2000);
  const from = String(sender || '').trim().slice(0, 40);
  if (!smsText) return { status: 'skipped', reason: 'empty message' };

  const parsed = parseSms(smsText, from);
  if (parsed.skip) return { status: 'skipped', reason: parsed.skip };

  // Exact time when we have it; otherwise the day written in the SMS at noon.
  const arrived = toDate(receivedAt);
  let date;
  if (arrived && (!parsed.date || Math.abs(arrived - parsed.date) < 2 * 864e5)) date = arrived;
  else if (parsed.date) date = new Date(parsed.date.getTime() + 12 * 3600e3);
  else date = arrived || new Date();
  if (date > new Date(Date.now() + 864e5)) date = new Date(); // never in the future

  const fingerprint = 'sms-' + crypto.createHash('sha256').update(`${from.toUpperCase()}|${smsText}`).digest('hex').slice(0, 40);

  // The bank AND the UPI app often both text about one payment: same rupee
  // amount and direction from a different sender within 20 minutes is the same
  // money — UNLESS both messages state a remaining balance and the balances
  // differ, which proves they are separate payments (found testing on a real
  // phone: three ₹2,000 debits minutes apart, from two Canara sender IDs).
  // SMS amounts are INR; for users with another base currency the stored row
  // keeps the INR figure in originalAmount, so match on either.
  const candidates = await Transaction.find({
    userId: user._id, type: parsed.type, source: 'sms_webhook',
    smsSender: { $ne: from },
    date: { $gte: new Date(date.getTime() - 20 * 60e3), $lte: new Date(date.getTime() + 20 * 60e3) },
    $or: [
      { amount: parsed.amount, originalCurrency: null },
      { originalAmount: parsed.amount, originalCurrency: 'INR' },
    ],
  }).select('_id smsRaw').lean();
  const myBalance = balanceOf(smsText);
  const near = candidates.find((c) => {
    const theirs = balanceOf(c.smsRaw || '');
    return myBalance === null || theirs === null || Math.abs(myBalance - theirs) < 0.01;
  });
  if (near) return { status: 'duplicate', reason: 'same payment already recorded from another SMS', transactionId: near._id };

  const { transaction, duplicate } = await createTransaction(
    { id: user._id, username: user.username },
    {
      type: parsed.type, amount: parsed.amount, currency: 'INR', date,
      category: parsed.category, description: parsed.description, merchant: parsed.merchant,
      tags: ['sms-auto'], smsSender: from, smsRaw: smsText.slice(0, 500), clientId: fingerprint,
    },
    { source: 'sms_webhook' }
  );
  if (duplicate) return { status: 'duplicate', reason: 'already imported', transactionId: transaction._id };
  return { status: 'created', transactionId: transaction._id, amount: parsed.amount, type: parsed.type, merchant: parsed.merchant, category: parsed.category };
};

// ── Live webhook ─────────────────────────────────────────────────────────────
router.post('/webhook/:token', async (req, res) => {
  const user = await User.findOne({ smsWebhookToken: String(req.params.token || '') }).select('username preferences');
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  // Forwarder apps name the fields differently.
  const b = req.body || {};
  const text = b.message || b.sms || b.text || b.body || b.content || '';
  if (!String(text).trim()) return res.status(400).json({ error: 'No message body found in request' });

  const result = await importSms(user, {
    text,
    sender: b.from || b.sender || b.address || b.number || '',
    receivedAt: b.timestamp || b.sentStamp || b.receivedStamp || b.time || b.date,
  });
  if (result.status === 'created') logger.info('sms: imported', { user: String(user._id), type: result.type, category: result.category });
  // 200 for skipped/duplicate so forwarders don't retry them.
  res.status(result.status === 'created' ? 201 : 200).json(result);
});

// ── Inbox backfill (JWT) ─────────────────────────────────────────────────────
router.post('/import', protect, async (req, res) => {
  const list = Array.isArray(req.body?.messages) ? req.body.messages : null;
  if (!list || !list.length) throw new HttpError(400, 'Send { messages: [{ body, address, date }] }.');
  if (list.length > 500) throw new HttpError(400, 'Up to 500 messages per request.');
  const user = await User.findById(req.user.id).select('username preferences');
  if (!user) throw new HttpError(404, 'User not found.');

  // Oldest first, so "the same payment from two senders" keeps the first one.
  const sorted = [...list].sort((a, b) => (Number(a?.date) || 0) - (Number(b?.date) || 0));
  const counts = { created: 0, duplicate: 0, skipped: 0 };
  const created = [];
  // Why messages were skipped, as counts only — never their text — so the user
  // (and we, when testing) can see the parser's decisions without exposing SMS.
  const skippedReasons = {};
  const skippedSenders = {};
  for (const m of sorted) {
    if (!m || typeof m !== 'object') { counts.skipped++; continue; }
    const r = await importSms(user, { text: m.body ?? m.message, sender: m.address ?? m.from, receivedAt: m.date ?? m.timestamp });
    counts[r.status]++;
    if (r.status === 'skipped') {
      skippedReasons[r.reason] = (skippedReasons[r.reason] || 0) + 1;
      // Business sender IDs (never phone numbers, never text) show which senders
      // we don't recognise — that's how a missing bank gets noticed.
      const from = String(m.address ?? m.from ?? '');
      if (/[a-z]/i.test(from) && !/^\+?\d+$/.test(from)) skippedSenders[from.toUpperCase()] = (skippedSenders[from.toUpperCase()] || 0) + 1;
    }
    if (r.status === 'created' && created.length < 20) created.push({ amount: r.amount, type: r.type, merchant: r.merchant, category: r.category });
  }
  logger.info('sms: inbox import', { user: String(user._id), ...counts, skippedReasons, skippedSenders });
  res.json({ ...counts, total: list.length, skippedReasons, skippedSenders, sample: created });
});

// ── Setup ────────────────────────────────────────────────────────────────────
router.get('/setup', protect, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new HttpError(404, 'User not found');
  if (!user.smsWebhookToken) {
    user.smsWebhookToken = genToken();
    await user.save({ validateBeforeSave: false });
  }
  const lastImported = await Transaction.findOne({ userId: user._id, source: 'sms_webhook' }).sort({ createdAt: -1 }).select('createdAt').lean();
  res.json({
    token: user.smsWebhookToken,
    webhookUrl: webhookUrlFor(user.smsWebhookToken),
    isActive: true,
    lastImportedAt: lastImported?.createdAt || null,
    // A phone can't reach "localhost" on the server's machine.
    reachableFromPhone: !/\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(env.BACKEND_URL),
  });
});

router.post('/token/regenerate', protect, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new HttpError(404, 'User not found');
  user.smsWebhookToken = genToken();
  await user.save({ validateBeforeSave: false });
  res.json({ token: user.smsWebhookToken, webhookUrl: webhookUrlFor(user.smsWebhookToken) });
});

router.get('/history', protect, async (req, res) => {
  const txns = await Transaction.find({
    userId: req.user.id,
    $or: [{ source: 'sms_webhook' }, { tags: 'sms-auto' }],
  }).sort({ createdAt: -1 }).limit(30).lean();
  res.json(txns);
});

module.exports = router;
module.exports.importSms = importSms;
module.exports.isBankSender = isBankSender;

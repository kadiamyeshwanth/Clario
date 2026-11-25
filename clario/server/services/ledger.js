/**
 * services/ledger.js — the single write path for transactions.
 *
 * Manual entry, SMS import, CSV import, receipts, recurring cron and split
 * expenses all create rows through here, so every row gets the same treatment:
 *
 *   1. foreign currency is converted to the user's base currency;
 *   2. behavioural flags (late-night, impulse, duplicate, abnormal) are computed;
 *   3. the linked wallet's balance moves by exactly this row's effect;
 *   4. anomaly notifications are raised.
 *
 * Wallet balances use atomic $inc so concurrent writes cannot lose an update.
 */
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const { detectFlags } = require('../utils/fraudDetector');
const { convert } = require('./fx');
const { notify } = require('./notify');
const { HttpError } = require('../lib/http');
const { formatMoney } = require('../utils/currencies');

const round2 = (n) => Math.round(n * 100) / 100;

const baseCurrencyOf = async (userId) => {
  const u = await User.findById(userId).select('preferences.currency').lean();
  return u?.preferences?.currency || 'INR';
};

/** Resolves the amount in base currency and the original-currency fields. */
const resolveAmount = async ({ amount, currency }, base) => {
  const cur = (currency || base).toUpperCase();
  if (cur === base) return { amount: round2(amount), originalAmount: null, originalCurrency: null, fxRate: null };
  const c = await convert(amount, cur, base);
  return { amount: c.amount, originalAmount: round2(amount), originalCurrency: cur, fxRate: c.rate };
};

/** How much this row moves its wallet, in the wallet's currency. */
const walletEffect = async (txn, wallet, base) => {
  const sign = txn.type === 'income' ? 1 : -1;
  const walletCur = (wallet.currency || base).toUpperCase();
  let value;
  if (txn.originalCurrency && txn.originalCurrency === walletCur) value = txn.originalAmount;
  else if (walletCur === base) value = txn.amount;
  else value = (await convert(txn.amount, base, walletCur)).amount;
  return round2(sign * value);
};

const loadWallet = async (userId, walletId) => {
  if (!walletId) return null;
  if (!mongoose.isValidObjectId(walletId)) throw new HttpError(400, 'Invalid wallet.');
  const wallet = await Wallet.findOne({ _id: walletId, userId }).lean();
  if (!wallet) throw new HttpError(404, 'Wallet not found.');
  return wallet;
};

const applyWallet = (walletId, delta) =>
  walletId && delta ? Wallet.updateOne({ _id: walletId }, { $inc: { balance: delta } }) : null;

const raiseFlagNotifications = async (userId, txn, base) => {
  if (txn.flags.includes('abnormal')) {
    await notify(userId, {
      title: 'Unusually large expense',
      body: `A ${formatMoney(txn.amount, base)} ${txn.category} expense is much higher than your usual spending in this category.`,
      type: 'warning', icon: 'warning', link: '/transactions', kind: 'anomaly',
    });
  }
  if (txn.flags.includes('duplicate')) {
    await notify(userId, {
      title: 'Possible duplicate transaction',
      body: `A similar ${formatMoney(txn.amount, base)} ${txn.category} transaction was recorded recently.`,
      type: 'warning', icon: 'repeat', link: '/transactions', kind: 'anomaly',
    });
  }
};

/**
 * Creates one transaction. `input` is already validated.
 * Options: { source, skipFlags, notifyFlags, base }.
 */
const createTransaction = async (user, input, opts = {}) => {
  const userId = user.id || user._id;
  const base = opts.base || (await baseCurrencyOf(userId));

  if (input.clientId) {
    const existing = await Transaction.findOne({ userId, clientId: input.clientId });
    if (existing) return { transaction: existing, duplicate: true };
  }

  const wallet = await loadWallet(userId, input.walletId);
  const money = await resolveAmount(input, base);
  const date = input.date instanceof Date ? input.date : new Date(Date.parse(input.date));
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Date is invalid.');

  const isTemplate = !!input.isRecurring;
  const flags = !opts.skipFlags && input.type === 'expense' && !isTemplate
    ? await detectFlags({ userId, amount: money.amount, category: input.category, type: input.type, date })
    : [];

  const doc = new Transaction({
    userId,
    username: user.username,
    type: input.type,
    category: input.category,
    ...money,
    date,
    description: input.description || '',
    merchant: input.merchant || '',
    notes: input.notes || '',
    tags: input.tags || [],
    flags,
    isRecurring: isTemplate,
    frequency: isTemplate ? (input.frequency && input.frequency !== 'once' ? input.frequency : 'monthly') : 'once',
    // A recurring template is a rule, not money moving; its instances move the wallet.
    walletId: wallet ? wallet._id : null,
    source: opts.source || input.source || 'manual',
    smsSender: input.smsSender || '',
    smsRaw: input.smsRaw || '',
    clientId: input.clientId || undefined,
  });
  if (wallet && !isTemplate) doc.walletAmount = await walletEffect(doc, wallet, base);

  await doc.save();
  if (doc.walletAmount) await applyWallet(doc.walletId, doc.walletAmount);
  if (opts.notifyFlags !== false) await raiseFlagNotifications(userId, doc, base);

  return { transaction: doc, duplicate: false };
};

/** Updates a transaction, reversing and re-applying its wallet effect. */
const updateTransaction = async (user, id, input) => {
  const userId = user.id || user._id;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid transaction id.');
  const txn = await Transaction.findOne({ _id: id, userId });
  if (!txn) throw new HttpError(404, 'Transaction not found.');
  const base = await baseCurrencyOf(userId);

  const oldWalletId = txn.walletId;
  const oldEffect = txn.walletAmount || 0;

  const walletId = input.walletId === undefined ? txn.walletId : input.walletId;
  const wallet = await loadWallet(userId, walletId);

  const amountChanged = input.amount !== undefined || input.currency !== undefined;
  if (amountChanged) {
    const money = await resolveAmount({
      amount: input.amount ?? (txn.originalAmount || txn.amount),
      currency: input.currency ?? (txn.originalCurrency || base),
    }, base);
    Object.assign(txn, money);
  }
  for (const k of ['type', 'category', 'description', 'merchant', 'notes', 'tags']) {
    if (input[k] !== undefined) txn[k] = input[k];
  }
  if (input.date !== undefined) txn.date = new Date(Date.parse(input.date));
  if (input.isRecurring !== undefined) {
    txn.isRecurring = !!input.isRecurring;
    txn.frequency = txn.isRecurring ? (input.frequency && input.frequency !== 'once' ? input.frequency : txn.frequency !== 'once' ? txn.frequency : 'monthly') : 'once';
  } else if (input.frequency && txn.isRecurring) {
    txn.frequency = input.frequency;
  }
  txn.walletId = wallet ? wallet._id : null;
  txn.walletAmount = wallet && !txn.isRecurring ? await walletEffect(txn, wallet, base) : null;

  await txn.save();
  if (oldWalletId && oldEffect) await applyWallet(oldWalletId, -oldEffect);
  if (txn.walletAmount) await applyWallet(txn.walletId, txn.walletAmount);
  return txn;
};

const deleteTransaction = async (user, id) => {
  const userId = user.id || user._id;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid transaction id.');
  const txn = await Transaction.findOneAndDelete({ _id: id, userId });
  if (!txn) throw new HttpError(404, 'Transaction not found.');
  if (txn.walletId && txn.walletAmount) await applyWallet(txn.walletId, -txn.walletAmount);
  return txn;
};

module.exports = { createTransaction, updateTransaction, deleteTransaction, baseCurrencyOf, resolveAmount };

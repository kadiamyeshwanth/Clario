/**
 * routes/wallets.js — accounts, their balances, and transfers between them.
 *
 * Balances move automatically when a transaction linked to a wallet is created,
 * edited or deleted (services/ledger.js). Transfers move money between two
 * wallets without counting as income or spending.
 */
const router = require('express').Router();
const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const Transfer = require('../models/Transfer');
const Transaction = require('../models/Transaction');
const protect = require('../middleware/protect');
const { validate } = require('../middleware/validate');
const { walletSchema, walletUpdateSchema, transferSchema } = require('../schemas/validation');
const { baseCurrencyOf } = require('../services/ledger');
const { convert } = require('../services/fx');
const { HttpError } = require('../lib/http');

router.use(protect);

const shape = (w) => ({ ...w, id: w._id });

// GET /api/wallets — wallets plus a total in the user's base currency
router.get('/', async (req, res) => {
  const base = await baseCurrencyOf(req.user.id);
  const wallets = await Wallet.find({ userId: req.user.id }).sort({ isDefault: -1, createdAt: 1 }).lean();
  let approximate = false;
  let totalBalance = 0;
  for (const w of wallets) {
    const cur = w.currency || base;
    if (cur === base) totalBalance += w.balance;
    else {
      const c = await convert(w.balance, cur, base);
      totalBalance += c.amount;
      approximate = approximate || c.approximate;
    }
  }
  res.json({ data: wallets.map(shape), totalBalance: Math.round(totalBalance * 100) / 100, currency: base, approximate });
});

router.post('/', validate(walletSchema), async (req, res) => {
  const base = await baseCurrencyOf(req.user.id);
  const count = await Wallet.countDocuments({ userId: req.user.id });
  if (count >= 50) throw new HttpError(400, 'You can have up to 50 accounts.');
  const isDefault = req.body.isDefault || count === 0;
  if (isDefault) await Wallet.updateMany({ userId: req.user.id }, { isDefault: false });
  const wallet = await Wallet.create({
    ...req.body,
    userId: req.user.id,
    currency: req.body.currency || base,
    color: req.body.color || '#E85002',
    isDefault,
  });
  res.status(201).json(shape(wallet.toObject()));
});

router.patch('/:id', validate(walletUpdateSchema), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid wallet id.');
  if (req.body.isDefault) await Wallet.updateMany({ userId: req.user.id }, { isDefault: false });
  // Whitelisted by walletUpdateSchema — userId/_id can never be overwritten.
  const wallet = await Wallet.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    { $set: req.body },
    { new: true, runValidators: true }
  ).lean();
  if (!wallet) throw new HttpError(404, 'Wallet not found.');
  res.json(shape(wallet));
});

// DELETE keeps the transactions (they are history) but unlinks them.
router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid wallet id.');
  const wallet = await Wallet.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
  if (!wallet) throw new HttpError(404, 'Wallet not found.');
  await Promise.all([
    Transaction.updateMany({ userId: req.user.id, walletId: wallet._id }, { walletId: null, walletAmount: null }),
    Transfer.deleteMany({ userId: req.user.id, $or: [{ fromWalletId: wallet._id }, { toWalletId: wallet._id }] }),
  ]);
  if (wallet.isDefault) {
    await Wallet.findOneAndUpdate({ userId: req.user.id }, { isDefault: true }, { sort: { createdAt: 1 } });
  }
  res.json({ message: 'Wallet deleted. Its transactions were kept.' });
});

// ── Transfers ───────────────────────────────────────────────────────────────

router.get('/transfers', async (req, res) => {
  const transfers = await Transfer.find({ userId: req.user.id }).sort({ date: -1 }).limit(200).lean();
  res.json(transfers.map((t) => ({ ...t, id: t._id })));
});

router.post('/transfer', validate(transferSchema), async (req, res) => {
  const { fromWalletId, toWalletId, amount, date, note } = req.body;
  const [from, to] = await Promise.all([
    Wallet.findOne({ _id: fromWalletId, userId: req.user.id }).lean(),
    Wallet.findOne({ _id: toWalletId, userId: req.user.id }).lean(),
  ]);
  if (!from || !to) throw new HttpError(404, 'Account not found.');

  // `amount` is in the source account's currency; the destination receives the converted figure.
  const received = from.currency === to.currency ? amount : (await convert(amount, from.currency, to.currency)).amount;
  const transfer = await Transfer.create({
    userId: req.user.id, fromWalletId, toWalletId, amount,
    date: date ? new Date(Date.parse(date)) : new Date(), note,
  });
  await Promise.all([
    Wallet.updateOne({ _id: fromWalletId }, { $inc: { balance: -amount } }),
    Wallet.updateOne({ _id: toWalletId }, { $inc: { balance: received } }),
  ]);
  res.status(201).json({ message: `Moved to ${to.name}.`, transfer: { ...transfer.toObject(), id: transfer._id, received } });
});

router.delete('/transfers/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid transfer id.');
  const t = await Transfer.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
  if (!t) throw new HttpError(404, 'Transfer not found.');
  const [from, to] = await Promise.all([Wallet.findById(t.fromWalletId).lean(), Wallet.findById(t.toWalletId).lean()]);
  const received = from && to && from.currency !== to.currency ? (await convert(t.amount, from.currency, to.currency)).amount : t.amount;
  await Promise.all([
    from && Wallet.updateOne({ _id: t.fromWalletId }, { $inc: { balance: t.amount } }),
    to && Wallet.updateOne({ _id: t.toWalletId }, { $inc: { balance: -received } }),
  ]);
  res.json({ message: 'Transfer reversed.' });
});

module.exports = router;

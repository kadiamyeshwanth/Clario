/**
 * routes/transactions.js — transaction CRUD, search, summary and export.
 * Every write goes through services/ledger.js.
 */
const router = require('express').Router();
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const protect = require('../middleware/protect');
const { validate } = require('../middleware/validate');
const { transactionSchema, transactionUpdateSchema } = require('../schemas/validation');
const ledger = require('../services/ledger');
const { escapeRegex, HttpError } = require('../lib/http');

router.use(protect);

const MAX_PAGE = 200;
const MAX_ALL = 20000; // hard ceiling for limit=0 ("everything") requests

const buildQuery = (userId, q) => {
  const query = { userId };
  if (q.type && q.type !== 'all') query.type = q.type;
  if (q.category && q.category !== 'all') query.category = String(q.category);
  if (q.walletId && mongoose.isValidObjectId(q.walletId)) query.walletId = q.walletId;
  if (q.source && q.source !== 'all') query.source = String(q.source);
  if (q.recurring === 'true') query.isRecurring = true;
  if (q.recurring === 'false') query.isRecurring = false;
  if (q.search) {
    const rx = new RegExp(escapeRegex(String(q.search).slice(0, 100)), 'i');
    query.$or = [{ description: rx }, { category: rx }, { merchant: rx }, { tags: rx }, { notes: rx }];
  }
  if (q.minAmount || q.maxAmount) {
    query.amount = {};
    if (q.minAmount) query.amount.$gte = Number(q.minAmount) || 0;
    if (q.maxAmount) query.amount.$lte = Number(q.maxAmount) || Number.MAX_SAFE_INTEGER;
  }
  if (q.dateFrom || q.dateTo) {
    query.date = {};
    if (q.dateFrom && !isNaN(Date.parse(q.dateFrom))) query.date.$gte = new Date(q.dateFrom);
    if (q.dateTo && !isNaN(Date.parse(q.dateTo))) query.date.$lte = new Date(new Date(q.dateTo).setHours(23, 59, 59, 999));
  }
  return query;
};

// GET /api/transactions — paginated, filterable. limit=0 returns everything (bounded).
router.get('/', async (req, res) => {
  const query = buildQuery(req.user.id, req.query);
  const ALLOWED_SORT = ['date', 'amount', 'category', 'type', 'createdAt'];
  const field = ALLOWED_SORT.includes(req.query.sortField) ? req.query.sortField : 'date';
  const dir = req.query.sortDir === 'asc' ? 1 : -1;
  const sort = { [field]: dir, _id: dir };

  const limitNum = Math.min(MAX_PAGE, Math.max(0, parseInt(req.query.limit ?? 50, 10) || 0));
  const requestedAll = String(req.query.limit) === '0';

  if (requestedAll) {
    const transactions = await Transaction.find(query).sort(sort).limit(MAX_ALL).lean();
    return res.json({ data: transactions, total: transactions.length, page: 1, pages: 1, limit: 0, truncated: transactions.length === MAX_ALL });
  }

  const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = limitNum || 50;
  const [total, transactions] = await Promise.all([
    Transaction.countDocuments(query),
    Transaction.find(query).sort(sort).skip((pageNum - 1) * size).limit(size).lean(),
  ]);
  res.json({ data: transactions, total, page: pageNum, pages: Math.ceil(total / size), limit: size });
});

// GET /api/transactions/summary — income, expenses and net (optionally in a date range)
router.get('/summary', async (req, res) => {
  const match = { ...buildQuery(new mongoose.Types.ObjectId(req.user.id), req.query), isRecurring: false };
  delete match.type;
  const result = await Transaction.aggregate([
    { $match: match },
    { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  const income = result.find((r) => r._id === 'income') || { total: 0, count: 0 };
  const expenses = result.find((r) => r._id === 'expense') || { total: 0, count: 0 };
  res.json({
    income: income.total,
    expenses: expenses.total,
    net: income.total - expenses.total,
    incomeCount: income.count,
    expenseCount: expenses.count,
  });
});

// GET /api/transactions/export.csv — the user's data, theirs to take anywhere.
router.get('/export.csv', async (req, res) => {
  const query = buildQuery(req.user.id, req.query);
  const cursor = Transaction.find({ ...query, isRecurring: false }).sort({ date: -1 }).lean().cursor();
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Neutralise spreadsheet formula injection, then quote.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="clario-transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.write('﻿Date,Type,Category,Amount,Original Amount,Original Currency,Merchant,Description,Tags,Notes,Source\n');
  for await (const t of cursor) {
    res.write([
      new Date(t.date).toISOString().slice(0, 10), t.type, t.category, t.amount,
      t.originalAmount ?? '', t.originalCurrency ?? '', t.merchant, t.description,
      (t.tags || []).join('; '), t.notes, t.source,
    ].map(cell).join(',') + '\n');
  }
  res.end();
});

// POST /api/transactions/add (legacy path) and POST /api/transactions
const create = async (req, res) => {
  const body = req.body;
  const { transaction, duplicate } = await ledger.createTransaction(req.user, body, {
    source: req.get('x-client-platform') === 'ios' || req.get('x-client-platform') === 'android' ? 'mobile' : 'manual',
  });
  // A recurring TEMPLATE also creates its first real occurrence immediately.
  if (body.isRecurring && !duplicate) {
    await ledger.createTransaction(req.user, { ...body, isRecurring: false, frequency: 'once', clientId: undefined, description: body.description || body.category }, { source: 'recurring_cron' });
    await Transaction.updateOne({ _id: transaction._id }, { recurrenceLastRun: new Date(transaction.date) });
  }
  res.status(duplicate ? 200 : 201).json({ message: duplicate ? 'Already saved.' : 'Transaction added!', transaction });
};
router.post('/', validate(transactionSchema), create);
router.post('/add', validate(transactionSchema), create);

// POST /api/transactions/bulk-delete — { ids: [] }
router.post('/bulk-delete', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => mongoose.isValidObjectId(id)).slice(0, 500) : [];
  if (!ids.length) throw new HttpError(400, 'No transactions selected.');
  let deleted = 0;
  for (const id of ids) {
    try { await ledger.deleteTransaction(req.user, id); deleted++; } catch { /* already gone */ }
  }
  res.json({ message: `${deleted} transaction${deleted === 1 ? '' : 's'} deleted.`, deleted });
});

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid transaction id.');
  const transaction = await Transaction.findOne({ _id: req.params.id, userId: req.user.id });
  if (!transaction) throw new HttpError(404, 'Transaction not found.');
  res.json(transaction);
});

router.delete('/:id', async (req, res) => {
  await ledger.deleteTransaction(req.user, req.params.id);
  res.json({ message: 'Transaction deleted.' });
});

const update = async (req, res) => {
  const transaction = await ledger.updateTransaction(req.user, req.params.id, req.body);
  res.json({ message: 'Transaction updated!', transaction });
};
router.patch('/:id', validate(transactionUpdateSchema), update);

// Deprecated — use PATCH /api/transactions/:id
router.post('/update/:id', validate(transactionUpdateSchema), (req, res, next) => {
  res.set('Deprecation', 'true');
  return update(req, res, next);
});

module.exports = router;

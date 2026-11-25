/**
 * routes/meta.js — reference data and the dashboard overview.
 *
 *   GET /currencies           supported currencies (public)
 *   GET /fx?from=&to=&amount= convert (JWT)
 *   GET /overview?month=YYYY-MM  one call for a month's dashboard (JWT)
 *
 * /overview is what the mobile app (and new web widgets) use instead of
 * downloading every transaction and summing on the device.
 */
const router = require('express').Router();
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const Goal = require('../models/Goal');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const protect = require('../middleware/protect');
const { CURRENCIES } = require('../utils/currencies');
const { convert } = require('../services/fx');
const { budgetStatus } = require('../services/budgets');
const { localMidnight, localParts, daysInMonth, localDayKey } = require('../services/periods');
const { HttpError } = require('../lib/http');

router.get('/currencies', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(Object.entries(CURRENCIES).map(([code, c]) => ({ code, symbol: c.symbol, name: c.name, locale: c.locale, decimals: c.decimals })));
});

router.get('/fx', protect, async (req, res) => {
  const amount = Number(req.query.amount ?? 1);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e12) throw new HttpError(400, 'Amount is invalid.');
  const result = await convert(amount, String(req.query.from || ''), String(req.query.to || ''));
  res.json({ from: String(req.query.from).toUpperCase(), to: String(req.query.to).toUpperCase(), input: amount, ...result });
});

router.get('/overview', protect, async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) throw new HttpError(404, 'User not found.');
  const tz = user.preferences?.timezone || 'UTC';
  const now = new Date();

  let { y, m } = localParts(now, tz);
  if (/^\d{4}-\d{2}$/.test(String(req.query.month || ''))) {
    y = Number(req.query.month.slice(0, 4));
    m = Number(req.query.month.slice(5, 7)) - 1;
  }
  const from = localMidnight(y, m, 1, tz);
  const to = localMidnight(y, m + 1, 1, tz);
  const prevFrom = localMidnight(y, m - 1, 1, tz);
  const uid = new mongoose.Types.ObjectId(req.user.id);

  const [rows, prevTotals, wallets, goals, subs, recent] = await Promise.all([
    Transaction.find({ userId: uid, isRecurring: false, date: { $gte: from, $lt: to } }).select('type amount category date').lean(),
    Transaction.aggregate([
      { $match: { userId: uid, isRecurring: false, date: { $gte: prevFrom, $lt: from } } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]),
    Wallet.find({ userId: uid }).lean(),
    Goal.find({ userId: uid }).sort({ deadline: 1 }).limit(5).lean(),
    Subscription.find({ userId: uid, status: 'active' }).lean(),
    Transaction.find({ userId: uid, isRecurring: false }).sort({ date: -1, createdAt: -1 }).limit(8).lean(),
  ]);

  const income = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const expenses = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const prev = Object.fromEntries(prevTotals.map((p) => [p._id, p.total]));

  const byCat = {};
  for (const r of rows) if (r.type === 'expense') byCat[r.category] = (byCat[r.category] || 0) + r.amount;
  const categories = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100, pct: expenses ? Math.round((amount / expenses) * 1000) / 10 : 0 }));

  const days = daysInMonth(y, m);
  const daily = Array.from({ length: days }, (_, i) => ({ day: i + 1, income: 0, expense: 0 }));
  for (const r of rows) {
    const key = localDayKey(r.date, tz);
    const d = Number(key.slice(8, 10));
    if (daily[d - 1]) daily[d - 1][r.type === 'income' ? 'income' : 'expense'] += r.amount;
  }

  const base = user.preferences?.currency || 'INR';
  let netWorth = 0;
  for (const w of wallets) netWorth += (w.currency || base) === base ? w.balance : (await convert(w.balance, w.currency, base)).amount;

  const monthlySubs = subs.reduce((s, x) => s + (x.billingCycle === 'yearly' ? x.amount / 12 : x.billingCycle === 'weekly' ? x.amount * 4.33 : x.amount), 0);
  const soon = new Date(Date.now() + 7 * 864e5);
  const upcomingBills = subs.filter((x) => x.renewalDate && new Date(x.renewalDate) <= soon && new Date(x.renewalDate) >= new Date(Date.now() - 864e5))
    .map((x) => ({ id: x._id, name: x.name, amount: x.amount, renewalDate: x.renewalDate }));

  const isCurrent = localParts(now, tz).y === y && localParts(now, tz).m === m;
  const budgets = isCurrent ? await budgetStatus(req.user.id, { timeZone: tz }) : null;

  const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : null;
  // Health score 0–100: savings rate, budget discipline, buffer of cash vs spend.
  const budgetScore = budgets && budgets.items.length ? (budgets.items.filter((b) => b.state !== 'over').length / budgets.items.length) * 100 : 70;
  const bufferMonths = expenses > 0 ? netWorth / expenses : 0;
  const health = Math.round(
    Math.max(0, Math.min(100, (savingsRate ?? 0) * 2)) * 0.45 +
    budgetScore * 0.3 +
    Math.max(0, Math.min(100, bufferMonths * 33)) * 0.25
  );

  res.json({
    month: `${y}-${String(m + 1).padStart(2, '0')}`,
    currency: base,
    totals: {
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      net: Math.round((income - expenses) * 100) / 100,
      prevIncome: prev.income || 0,
      prevExpenses: prev.expense || 0,
      savingsRate,
    },
    netWorth: Math.round(netWorth * 100) / 100,
    healthScore: health,
    categories,
    daily,
    budgets: budgets ? { items: budgets.items.map((b) => ({ id: b._id, category: b.category, limit: b.effectiveLimit, spent: b.spent, pct: b.pct, state: b.state })), totals: budgets.totals } : null,
    goals: goals.map((g) => ({ id: g._id, name: g.name, targetAmount: g.targetAmount, currentAmount: g.currentAmount, deadline: g.deadline })),
    subscriptions: { monthlyTotal: Math.round(monthlySubs * 100) / 100, active: subs.length, upcoming: upcomingBills },
    recent: recent.map((t) => ({ ...t, id: t._id })),
  });
});

module.exports = router;

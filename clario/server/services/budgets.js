/**
 * services/budgets.js — month-scoped budget status.
 */
const mongoose = require('mongoose');
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const { monthRange, localParts, daysInMonth } = require('./periods');

const spendByCategory = async (userId, from, to) => {
  const rows = await Transaction.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(String(userId)), type: 'expense', isRecurring: false, date: { $gte: from, $lt: to } } },
    { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, r]));
};

/**
 * Status of every budget for the month containing `now` (or `offset` months away).
 * Returns per-budget: spent, limit, effectiveLimit (with rollover), pct, remaining,
 * projected end-of-month spend and a state of ok | warning | over.
 */
const budgetStatus = async (userId, { now = new Date(), timeZone = 'UTC', offset = 0 } = {}) => {
  const budgets = await Budget.find({ userId }).lean();
  const { from, to } = monthRange(now, timeZone, offset);
  const spent = await spendByCategory(userId, from, to);

  const needsPrev = budgets.some((b) => b.rollover);
  const prevRange = needsPrev ? monthRange(now, timeZone, offset - 1) : null;
  const prevSpent = needsPrev ? await spendByCategory(userId, prevRange.from, prevRange.to) : {};

  const { y, m, d } = localParts(now, timeZone);
  const totalDays = daysInMonth(y, m);
  const elapsed = offset === 0 ? Math.max(1, d) : totalDays;

  const items = budgets.map((b) => {
    const s = spent[b.category]?.total || 0;
    const carried = b.rollover ? Math.max(0, b.limit - (prevSpent[b.category]?.total || 0)) : 0;
    const effectiveLimit = b.limit + carried;
    const pct = effectiveLimit > 0 ? (s / effectiveLimit) * 100 : 0;
    const projected = offset === 0 ? (s / elapsed) * totalDays : s;
    return {
      ...b,
      id: b._id,
      spent: Math.round(s * 100) / 100,
      count: spent[b.category]?.count || 0,
      carried: Math.round(carried * 100) / 100,
      effectiveLimit,
      remaining: Math.round((effectiveLimit - s) * 100) / 100,
      pct: Math.round(pct * 10) / 10,
      projected: Math.round(projected),
      state: pct >= 100 ? 'over' : pct >= (b.alertAt || 80) ? 'warning' : 'ok',
    };
  });

  const totals = items.reduce((t, i) => ({ limit: t.limit + i.effectiveLimit, spent: t.spent + i.spent }), { limit: 0, spent: 0 });
  return { from, to, items, totals };
};

module.exports = { budgetStatus, spendByCategory };

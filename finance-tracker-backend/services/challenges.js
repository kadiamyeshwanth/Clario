/**
 * services/challenges.js — challenge catalogue and live progress.
 *
 * Every challenge has a window [startDate, endDate) and a pass rule evaluated
 * against the user's real transactions in that window.
 */
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const { localDayKey } = require('./periods');

/** Templates offered to users. `days` is the default length. */
const CATALOGUE = [
  { key: 'no_spend_week',  kind: 'no_spend_days', title: 'No-spend weekend warrior', description: 'Have at least 3 days with zero spending in the next 7 days.', target: 3, days: 7 },
  { key: 'no_spend_month', kind: 'no_spend_days', title: '10 no-spend days', description: 'Rack up 10 days without spending anything this month.', target: 10, days: 30 },
  { key: 'food_cap',       kind: 'category_cap',  title: 'Eat-in fortnight', description: 'Keep Food spending under your cap for 14 days.', category: 'Food', target: null, days: 14 },
  { key: 'shopping_cap',   kind: 'category_cap',  title: 'Cart detox', description: 'Keep Shopping under your cap for 30 days.', category: 'Shopping', target: null, days: 30 },
  { key: 'save_20',        kind: 'savings_rate',  title: 'Save 20%', description: 'Keep at least 20% of what you earn over 30 days.', target: 20, days: 30 },
  { key: 'daily_cap',      kind: 'daily_cap',     title: 'Daily limit', description: 'Never spend more than your daily cap on a single day for 7 days.', target: null, days: 7 },
  { key: 'total_cap',      kind: 'total_cap',     title: 'Lean month', description: 'Keep total spending under your cap for 30 days.', target: null, days: 30 },
];

/** Progress for one challenge. Returns { value, target, pct, onTrack, passed, detail }. */
const progressOf = async (challenge, { now = new Date(), timeZone = 'UTC' } = {}) => {
  const userId = new mongoose.Types.ObjectId(String(challenge.userId));
  const from = new Date(challenge.startDate);
  const end = new Date(challenge.endDate);
  const to = now < end ? now : end;
  const finished = now >= end;

  const rows = await Transaction.find({ userId, isRecurring: false, date: { $gte: from, $lt: end } })
    .select('type amount category date').lean();
  const expenses = rows.filter((r) => r.type === 'expense');
  const totalSpent = expenses.reduce((s, r) => s + r.amount, 0);

  const totalDays = Math.max(1, Math.round((end - from) / 864e5));
  const elapsedDays = Math.min(totalDays, Math.max(1, Math.ceil((to - from) / 864e5)));

  const t = challenge.target;
  switch (challenge.kind) {
    case 'no_spend_days': {
      const spendDays = new Set(expenses.filter((e) => e.date <= to).map((e) => localDayKey(e.date, timeZone)));
      const noSpend = Math.max(0, elapsedDays - spendDays.size);
      const daysLeft = totalDays - elapsedDays;
      return {
        value: noSpend, target: t, pct: Math.min(100, (noSpend / t) * 100),
        onTrack: noSpend + daysLeft >= t, passed: finished ? noSpend >= t : noSpend >= t ? true : null,
        detail: `${noSpend} of ${t} no-spend days`,
      };
    }
    case 'category_cap':
    case 'total_cap': {
      const spent = challenge.kind === 'category_cap'
        ? expenses.filter((e) => e.category === challenge.category).reduce((s, e) => s + e.amount, 0)
        : totalSpent;
      const pace = (spent / elapsedDays) * totalDays;
      return {
        value: Math.round(spent), target: t, pct: t > 0 ? Math.min(100, (spent / t) * 100) : 0,
        onTrack: spent <= t && pace <= t * 1.05, passed: spent > t ? false : finished ? true : null,
        detail: `${Math.round(spent)} spent of ${t} cap`,
      };
    }
    case 'daily_cap': {
      const byDay = {};
      for (const e of expenses) {
        const k = localDayKey(e.date, timeZone);
        byDay[k] = (byDay[k] || 0) + e.amount;
      }
      const worst = Math.max(0, ...Object.values(byDay));
      const breaches = Object.values(byDay).filter((v) => v > t).length;
      return {
        value: Math.round(worst), target: t, pct: Math.min(100, (elapsedDays / totalDays) * 100),
        onTrack: breaches === 0, passed: breaches > 0 ? false : finished ? true : null,
        detail: breaches ? `${breaches} day(s) over the cap` : `${elapsedDays} of ${totalDays} days under the cap`,
      };
    }
    case 'savings_rate': {
      const income = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
      const rate = income > 0 ? ((income - totalSpent) / income) * 100 : 0;
      return {
        value: Math.round(rate), target: t, pct: Math.max(0, Math.min(100, (rate / t) * 100)),
        // No income yet isn't "at risk" — there's nothing to measure against.
        onTrack: income > 0 ? rate >= t : true, passed: finished ? income > 0 && rate >= t : null,
        detail: income > 0 ? `Saving ${Math.round(rate)}% of income` : 'No income recorded in this window yet',
      };
    }
    default:
      return { value: 0, target: t, pct: 0, onTrack: false, passed: null, detail: '' };
  }
};

module.exports = { CATALOGUE, progressOf };

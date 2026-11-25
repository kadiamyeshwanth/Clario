/**
 * cron/budgetAlertJob.js — budget warnings, bill reminders, challenge results
 * and the weekly digest. All notifications dedupe, so running hourly is safe.
 *
 * Fixes over the original budget alert:
 *   • Measured against THIS MONTH's spending (it used all-time totals, so every
 *     budget read "exceeded" forever after the first month).
 *   • Category names are no longer used as raw regexes for deduplication.
 *   • Honours the user's notification preferences and alert threshold.
 */
const Budget = require('../models/Budget');
const Subscription = require('../models/Subscription');
const Challenge = require('../models/Challenge');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { budgetStatus } = require('../services/budgets');
const { progressOf } = require('../services/challenges');
const { notify } = require('../services/notify');
const { localDayKey, localParts, dayRange } = require('../services/periods');
const { formatMoney } = require('../utils/currencies');
const logger = require('../lib/logger');

const usersWith = async (Model, filter = {}) => {
  const ids = await Model.distinct('userId', filter);
  return User.find({ _id: { $in: ids } }).select('preferences username').lean();
};

const runBudgetAlerts = async (now = new Date()) => {
  let sent = 0;
  for (const user of await usersWith(Budget)) {
    const tz = user.preferences?.timezone || 'UTC';
    const cur = user.preferences?.currency || 'INR';
    const month = localDayKey(now, tz).slice(0, 7);
    const { items } = await budgetStatus(user._id, { now, timeZone: tz });
    for (const b of items) {
      if (b.state === 'ok') continue;
      const over = b.state === 'over';
      const n = await notify(user._id, {
        title: over ? `${b.category} budget exceeded` : `${b.category} budget at ${Math.round(b.pct)}%`,
        body: over
          ? `You've spent ${formatMoney(b.spent, cur)} of your ${formatMoney(b.effectiveLimit, cur)} ${b.category} budget this month.`
          : `${formatMoney(b.spent, cur)} of ${formatMoney(b.effectiveLimit, cur)} used — ${formatMoney(b.remaining, cur)} left. At this pace you'll reach ${formatMoney(b.projected, cur)}.`,
        type: over ? 'danger' : 'warning', link: '/budgets', kind: 'budget',
        // One warning and one "exceeded" per budget per month.
        dedupeKey: `budget:${b._id}:${month}:${b.state}`, dedupeHours: 24 * 31,
      });
      if (n) sent++;
    }
  }
  return { sent };
};

/** Reminds about subscriptions renewing in the next 3 days, and rolls past renewal dates forward. */
const runBillReminders = async (now = new Date()) => {
  let sent = 0;
  const subs = await Subscription.find({ status: 'active', renewalDate: { $ne: null } });
  for (const s of subs) {
    // Roll a renewal date that has passed to the next cycle.
    let next = new Date(s.renewalDate);
    let rolled = false;
    for (let i = 0; i < 400 && next < new Date(now.getTime() - 864e5); i++) {
      if (s.billingCycle === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
      else if (s.billingCycle === 'yearly') next.setUTCFullYear(next.getUTCFullYear() + 1);
      else next.setUTCMonth(next.getUTCMonth() + 1);
      rolled = true;
    }
    if (rolled) { s.renewalDate = next; await s.save(); }

    const daysLeft = Math.ceil((next - now) / 864e5);
    if (daysLeft < 0 || daysLeft > 3) continue;
    const user = await User.findById(s.userId).select('preferences').lean();
    if (!user) continue;
    const n = await notify(s.userId, {
      title: daysLeft === 0 ? `${s.name} renews today` : `${s.name} renews in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
      body: `${formatMoney(s.amount, user.preferences?.currency)} (${s.billingCycle}). Still using it? You can pause or cancel it in Subscriptions.`,
      type: 'info', link: '/subscriptions', kind: 'bill',
      dedupeKey: `bill:${s._id}:${next.toISOString().slice(0, 10)}`, dedupeHours: 24 * 5,
    });
    if (n) sent++;
  }
  return { sent };
};

/** Closes challenges whose window has ended and records the outcome. */
const runChallengeJob = async (now = new Date()) => {
  let closed = 0;
  const due = await Challenge.find({ status: 'active', endDate: { $lte: now } });
  for (const c of due) {
    const user = await User.findById(c.userId).select('preferences').lean();
    const p = await progressOf(c, { now, timeZone: user?.preferences?.timezone || 'UTC' });
    c.status = p.passed ? 'completed' : 'failed';
    c.finalProgress = Math.round(p.pct);
    c.completedAt = now;
    await c.save();
    closed++;
    await notify(c.userId, {
      title: p.passed ? `Challenge complete: ${c.title}` : `Challenge ended: ${c.title}`,
      body: p.passed ? `You did it — ${p.detail}. That's a habit worth keeping.` : `${p.detail}. Every attempt teaches something — try a slightly easier target next time.`,
      type: p.passed ? 'success' : 'info', link: '/challenges', kind: 'challenge',
      dedupeKey: `challenge:${c._id}:done`, dedupeHours: 24 * 400,
    });
  }
  // Mid-challenge failure for caps: tell the user once when they go over.
  const active = await Challenge.find({ status: 'active', kind: { $in: ['category_cap', 'total_cap', 'daily_cap'] } }).lean();
  for (const c of active) {
    const p = await progressOf(c, { now });
    if (p.passed === false) {
      await Challenge.updateOne({ _id: c._id }, { status: 'failed', finalProgress: Math.round(p.pct), completedAt: now });
      await notify(c.userId, {
        title: `Over the cap: ${c.title}`, body: `${p.detail}. This one's done — start a fresh attempt whenever you're ready.`,
        type: 'warning', link: '/challenges', kind: 'challenge', dedupeKey: `challenge:${c._id}:done`, dedupeHours: 24 * 400,
      });
      closed++;
    }
  }
  return { closed };
};

/** Monday-morning summary of last week, in the user's timezone. */
const runWeeklyDigest = async (now = new Date()) => {
  let sent = 0;
  for (const user of await usersWith(Transaction, { isRecurring: false, date: { $gte: new Date(now.getTime() - 14 * 864e5) } })) {
    const tz = user.preferences?.timezone || 'UTC';
    const { dow } = localParts(now, tz);
    if (dow !== 1) continue; // Mondays only
    const weekEnd = dayRange(now, tz).from;
    const weekStart = new Date(weekEnd.getTime() - 7 * 864e5);
    const prevStart = new Date(weekStart.getTime() - 7 * 864e5);
    const [thisWeek, lastWeek] = await Promise.all([
      Transaction.find({ userId: user._id, isRecurring: false, type: 'expense', date: { $gte: weekStart, $lt: weekEnd } }).select('amount category').lean(),
      Transaction.find({ userId: user._id, isRecurring: false, type: 'expense', date: { $gte: prevStart, $lt: weekStart } }).select('amount').lean(),
    ]);
    const total = thisWeek.reduce((s, t) => s + t.amount, 0);
    const prev = lastWeek.reduce((s, t) => s + t.amount, 0);
    const byCat = {};
    thisWeek.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    const cur = user.preferences?.currency || 'INR';
    const delta = prev > 0 ? Math.round(((total - prev) / prev) * 100) : null;
    const n = await notify(user._id, {
      title: 'Your week in money',
      body: `You spent ${formatMoney(total, cur)} last week${delta !== null ? ` (${delta >= 0 ? '+' : ''}${delta}% vs the week before)` : ''}.${top ? ` Biggest: ${top[0]} at ${formatMoney(top[1], cur)}.` : ''}`,
      type: 'info', link: '/analytics', kind: 'digest',
      dedupeKey: `digest:${localDayKey(now, tz)}`, dedupeHours: 24 * 6,
    });
    if (n) sent++;
  }
  return { sent };
};

const runAllAlerts = async (now = new Date()) => {
  const out = {};
  for (const [name, fn] of Object.entries({ budgets: runBudgetAlerts, bills: runBillReminders, challenges: runChallengeJob, digest: runWeeklyDigest })) {
    try { out[name] = await fn(now); } catch (err) { logger.error(`alerts: ${name} failed`, { err: err.message }); }
  }
  logger.info('alerts run', out);
  return out;
};

module.exports = { runBudgetAlerts, runBillReminders, runChallengeJob, runWeeklyDigest, runAllAlerts };

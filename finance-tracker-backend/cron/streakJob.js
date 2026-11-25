/**
 * cron/streakJob.js — daily streak updater.
 *
 * Fixes over the original:
 *   • Streaks can actually grow: the old check compared lastUpdated with
 *     *yesterday* (the day being scored) instead of the day before it, so every
 *     streak reset to 1 each night.
 *   • A day with no transactions at all is a no-spend day.
 *   • "Healthy day" means at or below your own 90-day daily average, not a
 *     fixed ₹2000 that meant nothing in other currencies.
 *   • Runs hourly and scores "yesterday" in each user's own timezone.
 */
const cron = require('node-cron');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Streak = require('../models/Streak');
const User = require('../models/User');
const { dayRange, localDayKey } = require('../services/periods');
const logger = require('../lib/logger');

const scoreUser = async (user, now = new Date()) => {
  const tz = user.preferences?.timezone || 'UTC';
  const { from, to } = dayRange(now, tz, -1);         // yesterday, local
  const dayKey = localDayKey(from, tz);
  const prevKey = localDayKey(new Date(from.getTime() - 12 * 3600e3), tz);

  let streak = await Streak.findOne({ userId: user._id });
  if (!streak) streak = new Streak({ userId: user._id });
  // Already scored this day (job runs hourly).
  if (streak.noSpend.lastUpdated && localDayKey(streak.noSpend.lastUpdated, tz) === dayKey) return false;

  const uid = new mongoose.Types.ObjectId(String(user._id));
  const [dayRows, avgRows] = await Promise.all([
    Transaction.aggregate([
      { $match: { userId: uid, isRecurring: false, date: { $gte: from, $lt: to } } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      { $match: { userId: uid, isRecurring: false, type: 'expense', date: { $gte: new Date(from.getTime() - 90 * 864e5), $lt: from } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);
  const spent = dayRows.find((r) => r._id === 'expense')?.total || 0;
  const earned = dayRows.find((r) => r._id === 'income')?.total || 0;
  const dailyAvg = (avgRows[0]?.total || 0) / 90;

  const bump = (s, ok) => {
    const continues = s.lastUpdated && localDayKey(s.lastUpdated, tz) === prevKey && s.current > 0;
    s.current = ok ? (continues ? s.current + 1 : 1) : 0;
    s.longest = Math.max(s.longest || 0, s.current);
    s.lastUpdated = from;
  };
  bump(streak.noSpend, spent === 0);
  bump(streak.savings, earned > spent);
  bump(streak.healthy, spent > 0 && dailyAvg > 0 && spent <= dailyAvg);
  await streak.save();
  return true;
};

const runStreakJob = async (now = new Date()) => {
  let scored = 0;
  // Only users who have ever recorded something; cursor keeps memory flat.
  const ids = await Transaction.distinct('userId');
  const cursor = User.find({ _id: { $in: ids } }).select('preferences.timezone').lean().cursor();
  for await (const user of cursor) {
    try { if (await scoreUser(user, now)) scored++; } catch (err) { logger.error('streak: user failed', { user: String(user._id), err: err.message }); }
  }
  logger.info(`streaks: scored ${scored} user(s)`);
  return { scored };
};

const startStreakCron = () => {
  cron.schedule('15 * * * *', () => runStreakJob().catch((e) => logger.error('streak job', { err: e.message })));
};

module.exports = { startStreakCron, runStreakJob, scoreUser };

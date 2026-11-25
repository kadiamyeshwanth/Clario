/**
 * routes/challenges.js — join, track and finish spending challenges.
 *
 *   GET    /catalogue     what can be joined (with suggested targets from your data)
 *   GET    /              your challenges with live progress
 *   POST   /join          { key, target?, category?, days? }
 *   POST   /:id/abandon
 *   DELETE /:id           remove a finished/abandoned one from history
 */
const router = require('express').Router();
const mongoose = require('mongoose');
const Challenge = require('../models/Challenge');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const protect = require('../middleware/protect');
const { validate } = require('../middleware/validate');
const { challengeJoinSchema } = require('../schemas/validation');
const { CATALOGUE, progressOf } = require('../services/challenges');
const { dayRange } = require('../services/periods');
const { HttpError } = require('../lib/http');

router.use(protect);

const tzOf = async (userId) => (await User.findById(userId).select('preferences.timezone').lean())?.preferences?.timezone || 'UTC';

/** Suggested caps: 80% of the user's average 30-day spend (so the challenge is a stretch, not a fantasy). */
const suggestions = async (userId) => {
  const since = new Date(Date.now() - 90 * 864e5);
  const rows = await Transaction.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), type: 'expense', isRecurring: false, date: { $gte: since } } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
  ]);
  const per30 = Object.fromEntries(rows.map((r) => [r._id, r.total / 3]));
  const total30 = rows.reduce((s, r) => s + r.total, 0) / 3;
  return { per30, total30 };
};

const roundNice = (n) => {
  if (!n || n < 10) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
};

router.get('/catalogue', async (req, res) => {
  const { per30, total30 } = await suggestions(req.user.id);
  res.json(CATALOGUE.map((c) => {
    let target = c.target;
    if (c.kind === 'category_cap') target = roundNice((per30[c.category] || 0) * 0.8 * (c.days / 30));
    if (c.kind === 'total_cap') target = roundNice(total30 * 0.85 * (c.days / 30));
    if (c.kind === 'daily_cap') target = roundNice((total30 / 30) * 0.9);
    return { ...c, suggestedTarget: target || null };
  }));
});

router.get('/', async (req, res) => {
  const timeZone = await tzOf(req.user.id);
  const list = await Challenge.find({ userId: req.user.id }).sort({ status: 1, endDate: -1 }).limit(100).lean();
  const now = new Date();
  const out = [];
  for (const c of list) {
    const progress = c.status === 'active' ? await progressOf(c, { now, timeZone }) : { pct: c.finalProgress ?? 0, passed: c.status === 'completed' };
    out.push({ ...c, id: c._id, progress, daysLeft: Math.max(0, Math.ceil((new Date(c.endDate) - now) / 864e5)) });
  }
  res.json(out);
});

router.post('/join', validate(challengeJoinSchema), async (req, res) => {
  const tmpl = CATALOGUE.find((c) => c.key === req.body.key);
  if (!tmpl) throw new HttpError(400, 'Unknown challenge.');
  const target = req.body.target ?? tmpl.target;
  if (!(target > 0)) throw new HttpError(400, 'Set a target for this challenge.');
  if (tmpl.kind === 'no_spend_days' && target > (req.body.days || tmpl.days)) throw new HttpError(400, 'Target days cannot exceed the challenge length.');

  const active = await Challenge.countDocuments({ userId: req.user.id, status: 'active' });
  if (active >= 10) throw new HttpError(400, 'You can run up to 10 challenges at once.');
  const title = req.body.title || tmpl.title;
  const dup = await Challenge.exists({ userId: req.user.id, status: 'active', title });
  if (dup) throw new HttpError(409, 'You are already doing this challenge.');

  const timeZone = await tzOf(req.user.id);
  const start = dayRange(new Date(), timeZone).from;
  const days = req.body.days || tmpl.days;
  const challenge = await Challenge.create({
    userId: req.user.id, kind: tmpl.kind, title,
    category: tmpl.kind === 'category_cap' ? (req.body.category || tmpl.category) : '',
    target, startDate: start, endDate: new Date(start.getTime() + days * 864e5),
  });
  res.status(201).json({ ...challenge.toObject(), id: challenge._id, daysLeft: days, progress: await progressOf(challenge, { timeZone }) });
});

router.post('/:id/abandon', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid id.');
  const c = await Challenge.findOneAndUpdate({ _id: req.params.id, userId: req.user.id, status: 'active' }, { status: 'abandoned' }, { new: true });
  if (!c) throw new HttpError(404, 'Active challenge not found.');
  res.json({ message: 'Challenge ended.' });
});

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid id.');
  const c = await Challenge.findOneAndDelete({ _id: req.params.id, userId: req.user.id, status: { $ne: 'active' } });
  if (!c) throw new HttpError(404, 'Only finished challenges can be removed.');
  res.json({ message: 'Removed.' });
});

module.exports = router;

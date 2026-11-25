/**
 * routes/budgets.js — monthly category budgets.
 *
 *   GET    /           budgets with this month's status (spent, pct, state…)
 *   GET    /status     same, for ?offset=-1 (last month) etc.
 *   POST   /add        create or update (upsert by category)
 *   PATCH  /:id        change limit / rollover / alert threshold
 *   DELETE /:id
 */
const router = require('express').Router();
const mongoose = require('mongoose');
const Budget = require('../models/Budget');
const User = require('../models/User');
const protect = require('../middleware/protect');
const { validate } = require('../middleware/validate');
const { budgetSchema } = require('../schemas/validation');
const { budgetStatus } = require('../services/budgets');
const { HttpError } = require('../lib/http');

router.use(protect);

const tzOf = async (userId) => (await User.findById(userId).select('preferences.timezone').lean())?.preferences?.timezone || 'UTC';

// The array shape is what the existing web client expects; status is folded in.
router.get('/', async (req, res) => {
  const status = await budgetStatus(req.user.id, { timeZone: await tzOf(req.user.id) });
  res.json(status.items);
});

router.get('/status', async (req, res) => {
  const offset = Math.max(-24, Math.min(0, parseInt(req.query.offset, 10) || 0));
  res.json(await budgetStatus(req.user.id, { timeZone: await tzOf(req.user.id), offset }));
});

router.post('/add', validate(budgetSchema), async (req, res) => {
  const { category, limit } = req.body;
  const extra = {};
  if (typeof req.body.rollover === 'boolean') extra.rollover = req.body.rollover;
  const alertAt = Number(req.body.alertAt);
  if (alertAt >= 10 && alertAt <= 100) extra.alertAt = alertAt;
  const budget = await Budget.findOneAndUpdate(
    { userId: req.user.id, category },
    { userId: req.user.id, username: req.user.username, category, limit, ...extra },
    { upsert: true, new: true, runValidators: true }
  );
  res.json({ message: `Budget for ${budget.category} saved!`, budget });
});

router.patch('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid budget id.');
  const update = {};
  if (req.body.limit !== undefined) {
    const n = Number(req.body.limit);
    if (!(n >= 1 && n <= 1e10)) throw new HttpError(400, 'Limit must be at least 1.');
    update.limit = n;
  }
  if (typeof req.body.rollover === 'boolean') update.rollover = req.body.rollover;
  if (req.body.alertAt !== undefined) {
    const a = Number(req.body.alertAt);
    if (!(a >= 10 && a <= 100)) throw new HttpError(400, 'Alert threshold must be between 10% and 100%.');
    update.alertAt = a;
  }
  const budget = await Budget.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, update, { new: true, runValidators: true });
  if (!budget) throw new HttpError(404, 'Budget not found.');
  res.json({ message: 'Budget updated.', budget });
});

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid budget id.');
  const budget = await Budget.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
  if (!budget) throw new HttpError(404, 'Budget not found.');
  res.json({ message: 'Budget deleted.' });
});

module.exports = router;

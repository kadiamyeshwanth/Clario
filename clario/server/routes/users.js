/**
 * routes/users.js — profile, preferences, devices, data export and deletion.
 *
 *   GET    /stats            quick counts for Settings
 *   PATCH  /profile          username / display name
 *   GET    /preferences      currency, language, timezone, notification toggles
 *   PATCH  /preferences      update them (base-currency change can convert history)
 *   PATCH  /password         change (or, for Google-only accounts, set) a password
 *   POST   /onboarding       mark first-run setup complete
 *   POST   /push-token       register an Expo push token for this phone
 *   DELETE /push-token       unregister it
 *   GET    /export           every record the user owns, as JSON (portability)
 *   DELETE /data             clear financial data, keep the account
 *   DELETE /account          delete the account and everything in it
 */
const router = require('express').Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Goal = require('../models/Goal');
const Budget = require('../models/Budget');
const Wallet = require('../models/Wallet');
const Transfer = require('../models/Transfer');
const Subscription = require('../models/Subscription');
const Investment = require('../models/Investment');
const Category = require('../models/Category');
const Notification = require('../models/Notification');
const JournalEntry = require('../models/JournalEntry');
const MoodLog = require('../models/MoodLog');
const Streak = require('../models/Streak');
const Challenge = require('../models/Challenge');
const Session = require('../models/Session');
const PushToken = require('../models/PushToken');
const Family = require('../models/Family');
const SplitGroup = require('../models/SplitGroup');
const protect = require('../middleware/protect');
const { validate } = require('../middleware/validate');
const { changePasswordSchema, updateProfileSchema, preferencesSchema } = require('../schemas/validation');
const { revokeAll } = require('../services/sessions');
const { rate } = require('../services/fx');
const { HttpError } = require('../lib/http');

router.use(protect);

/** Collections whose rows belong to exactly one user via `userId`. */
const OWNED = { Transaction, Goal, Budget, Wallet, Transfer, Subscription, Investment, Category, Notification, JournalEntry, MoodLog, Streak, Challenge };
const FINANCIAL = { Transaction, Goal, Budget, Wallet, Transfer, Subscription, Investment, JournalEntry, MoodLog, Streak, Challenge };

router.get('/stats', async (req, res) => {
  const [txCount, goalCount, budgetCount, walletCount, user] = await Promise.all([
    Transaction.countDocuments({ userId: req.user.id }),
    Goal.countDocuments({ userId: req.user.id }),
    Budget.countDocuments({ userId: req.user.id }),
    Wallet.countDocuments({ userId: req.user.id }),
    User.findById(req.user.id).lean(),
  ]);
  if (!user) throw new HttpError(404, 'User not found.');
  res.json({
    username: user.username, email: user.email, memberSince: user.createdAt,
    transactions: txCount, goals: goalCount, budgets: budgetCount, wallets: walletCount,
  });
});

router.patch('/profile', validate(updateProfileSchema), async (req, res) => {
  const { username } = req.body;
  const displayName = typeof req.body.displayName === 'string' ? req.body.displayName.trim().slice(0, 60) : undefined;
  if (!username && displayName === undefined) throw new HttpError(400, 'Nothing to update.');
  const update = {};
  if (username) {
    const taken = await User.findOne({ username, _id: { $ne: req.user.id } }).lean();
    if (taken) throw new HttpError(409, 'That username is already taken.');
    update.username = username;
  }
  if (displayName !== undefined) update.displayName = displayName;
  const user = await User.findByIdAndUpdate(req.user.id, update, { new: true, runValidators: true });
  res.json({ message: 'Profile updated.', user: user.toPublic() });
});

router.get('/preferences', async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) throw new HttpError(404, 'User not found.');
  res.json(user.preferences || {});
});

router.patch('/preferences', validate(preferencesSchema), async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new HttpError(404, 'User not found.');
  const { convertExisting, notifications, ...rest } = req.body;
  const prevCurrency = user.preferences.currency || 'INR';

  let converted = null;
  if (rest.currency && rest.currency !== prevCurrency && convertExisting) {
    // One rate for the whole history: the point is that totals stay meaningful
    // in the new currency, not to re-price each past day.
    const { rate: r, approximate } = await rate(prevCurrency, rest.currency);
    const uid = new mongoose.Types.ObjectId(req.user.id);
    const mul = (field) => ({ $round: [{ $multiply: [`$${field}`, r] }, 2] });
    const [tx, b, g, s, inv] = await Promise.all([
      // Rows first entered in the NEW currency (e.g. ₹ bank SMS for a user moving
      // back to INR) get their exact original figure back instead of a
      // double-converted approximation; everything else is re-priced.
      Transaction.updateMany({ userId: uid }, [
        { $set: { _native: { $eq: ['$originalCurrency', rest.currency] } } },
        { $set: {
          amount: { $cond: ['$_native', '$originalAmount', mul('amount')] },
          originalAmount: { $cond: ['$_native', null, '$originalAmount'] },
          fxRate: { $cond: ['$_native', null, '$fxRate'] },
          originalCurrency: { $cond: ['$_native', null, '$originalCurrency'] },
        } },
        { $unset: '_native' },
      ]),
      Budget.updateMany({ userId: uid }, [{ $set: { limit: mul('limit') } }]),
      Goal.updateMany({ userId: uid }, [{ $set: { targetAmount: mul('targetAmount'), currentAmount: mul('currentAmount') } }]),
      Subscription.updateMany({ userId: uid }, [{ $set: { amount: mul('amount') } }]),
      Investment.updateMany({ userId: uid }, [{ $set: { investedAmount: mul('investedAmount'), currentValue: mul('currentValue') } }]),
    ]);
    converted = { rate: r, approximate, transactions: tx.modifiedCount, budgets: b.modifiedCount, goals: g.modifiedCount, subscriptions: s.modifiedCount, investments: inv.modifiedCount };
  }

  Object.assign(user.preferences, rest);
  if (notifications) Object.assign(user.preferences.notifications, notifications);
  await user.save({ validateBeforeSave: true });
  res.json({ message: 'Preferences saved.', preferences: user.preferences, converted });
});

router.post('/onboarding', async (req, res) => {
  await User.updateOne({ _id: req.user.id, onboardedAt: null }, { onboardedAt: new Date() });
  res.json({ message: 'Welcome aboard.' });
});

router.patch('/password', async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new HttpError(404, 'User not found.');
  // Google-only accounts may set a first password without a current one.
  const schema = user.password ? changePasswordSchema : changePasswordSchema.omit({ currentPassword: true });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message || 'Invalid password.');
  if (user.password && !(await user.comparePassword(parsed.data.currentPassword))) {
    throw new HttpError(401, 'Current password is incorrect.');
  }
  user.password = parsed.data.newPassword;
  await user.save();
  // Every other device must sign in again with the new password.
  await revokeAll(user._id, req.get('x-session-id') && mongoose.isValidObjectId(req.get('x-session-id')) ? req.get('x-session-id') : undefined);
  res.json({ message: 'Password changed. Other devices were signed out.' });
});

router.post('/push-token', async (req, res) => {
  const token = String(req.body?.token || '');
  if (!/^(ExponentPushToken|ExpoPushToken)\[[\w-]+\]$/.test(token)) throw new HttpError(400, 'Not a valid Expo push token.');
  const platform = ['ios', 'android', 'web'].includes(req.body?.platform) ? req.body.platform : 'android';
  await PushToken.findOneAndUpdate({ token }, { userId: req.user.id, platform, lastSeenAt: new Date() }, { upsert: true });
  res.json({ message: 'Notifications enabled on this device.' });
});

router.delete('/push-token', async (req, res) => {
  await PushToken.deleteOne({ token: String(req.body?.token || ''), userId: req.user.id });
  res.json({ message: 'Notifications disabled on this device.' });
});

router.get('/export', async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId).lean();
  if (!user) throw new HttpError(404, 'User not found.');
  const out = {
    exportedAt: new Date().toISOString(),
    format: 'clario-export-v1',
    profile: { username: user.username, email: user.email, displayName: user.displayName, preferences: user.preferences, createdAt: user.createdAt },
  };
  for (const [name, Model] of Object.entries(OWNED)) {
    out[name.charAt(0).toLowerCase() + name.slice(1) + 's'] = await Model.find({ userId }).select('-__v -userId -username').lean();
  }
  res.setHeader('Content-Disposition', `attachment; filename="clario-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(out);
});

router.delete('/data', async (req, res) => {
  const userId = req.user.id;
  const results = await Promise.all(Object.values(FINANCIAL).map((M) => M.deleteMany({ userId })));
  const deleted = Object.fromEntries(Object.keys(FINANCIAL).map((k, i) => [k.toLowerCase(), results[i].deletedCount]));
  res.json({ message: 'All data cleared.', deleted });
});

router.delete('/account', async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId);
  if (!user) throw new HttpError(404, 'User not found.');
  // Require the password for password accounts: deletion is irreversible.
  if (user.password) {
    const pw = String(req.body?.password || '');
    if (!pw || !(await user.comparePassword(pw))) throw new HttpError(401, 'Enter your password to delete your account.');
  }
  await Promise.all([
    ...Object.values(OWNED).map((M) => M.deleteMany({ userId })),
    Session.deleteMany({ userId }),
    PushToken.deleteMany({ userId }),
    Family.updateMany({ members: userId }, { $pull: { members: userId } }),
    // In shared groups the person stays as a named guest so others' balances still add up.
    SplitGroup.updateMany({ 'members.userId': userId }, { $set: { 'members.$[m].userId': null } }, { arrayFilters: [{ 'm.userId': user._id }] }),
  ]);
  await Family.deleteMany({ members: { $size: 0 } });
  await User.deleteOne({ _id: userId });
  res.json({ message: 'Account and all data deleted successfully.' });
});

module.exports = router;

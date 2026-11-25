/**
 * routes/splits.js — shared expenses with friends, flatmates and trips.
 *
 *   GET    /groups                    my groups with my balance in each
 *   POST   /groups                    create { name, currency, members:[{name,email}] }
 *   POST   /groups/join               { code } — join; claims a guest seat matching my email
 *   GET    /groups/:id                group, members, balances, suggested settle-ups, expenses
 *   PATCH  /groups/:id                rename / archive
 *   POST   /groups/:id/members        add a guest member
 *   DELETE /groups/:id/members/:mid   remove a member with a zero balance
 *   POST   /groups/:id/expenses       add a shared expense
 *   DELETE /groups/:id/expenses/:eid  delete one (creator or group owner)
 *   POST   /groups/:id/settle         record a settle-up payment
 *   POST   /groups/:id/leave          leave (only when settled)
 */
const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const SplitGroup = require('../models/SplitGroup');
const SplitExpense = require('../models/SplitExpense');
const User = require('../models/User');
const protect = require('../middleware/protect');
const { validate } = require('../middleware/validate');
const { splitGroupSchema, splitMemberSchema, splitExpenseSchema, settlementSchema } = require('../schemas/validation');
const { computeShares, balances, simplify } = require('../services/splits');
const ledger = require('../services/ledger');
const { notify } = require('../services/notify');
const { formatMoney } = require('../utils/currencies');
const { HttpError } = require('../lib/http');

router.use(protect);

const code = () => crypto.randomBytes(5).toString('base64url').replace(/[-_]/g, 'x').slice(0, 7).toUpperCase();

const loadGroup = async (id, userId) => {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid group id.');
  const group = await SplitGroup.findById(id);
  if (!group) throw new HttpError(404, 'Group not found.');
  const me = group.members.find((m) => m.userId && String(m.userId) === String(userId));
  if (!me) throw new HttpError(404, 'Group not found.');
  return { group, me };
};

const memberIds = (group) => new Set(group.members.map((m) => String(m._id)));

/** Notify the other registered members of something that changed their balance. */
const tellOthers = async (group, actorUserId, title, body) => {
  const others = group.members.filter((m) => m.userId && String(m.userId) !== String(actorUserId));
  await Promise.all(others.map((m) => notify(m.userId, { title, body, type: 'info', link: `/splits/${group._id}`, kind: 'split' })));
};

router.get('/groups', async (req, res) => {
  const groups = await SplitGroup.find({ 'members.userId': req.user.id }).sort({ archived: 1, updatedAt: -1 }).lean();
  const ids = groups.map((g) => g._id);
  const expenses = await SplitExpense.find({ groupId: { $in: ids } }).select('groupId amount paidByMemberId shares').lean();
  const byGroup = new Map();
  for (const e of expenses) {
    const k = String(e.groupId);
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k).push(e);
  }
  res.json(groups.map((g) => {
    const me = g.members.find((m) => m.userId && String(m.userId) === req.user.id);
    const bal = balances(g.members, byGroup.get(String(g._id)) || []);
    const mine = bal.find((b) => b.memberId === String(me._id));
    return {
      id: g._id, name: g.name, currency: g.currency, archived: g.archived, inviteCode: g.inviteCode,
      memberCount: g.members.length, myBalance: mine ? mine.net : 0, updatedAt: g.updatedAt,
    };
  }));
});

router.post('/groups', validate(splitGroupSchema), async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  const currency = req.body.currency || user.preferences?.currency || 'INR';
  const members = [
    { userId: user._id, name: user.displayName || user.username, email: user.email },
    ...req.body.members.filter((m) => !m.email || m.email.toLowerCase() !== user.email).map((m) => ({ name: m.name, email: m.email || '' })),
  ];
  let group;
  for (let attempt = 0; attempt < 5 && !group; attempt++) {
    try {
      group = await SplitGroup.create({ name: req.body.name, currency, createdBy: user._id, members, inviteCode: code() });
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  if (!group) throw new HttpError(500, 'Could not create the group. Please try again.');
  res.status(201).json({ id: group._id, ...group.toObject() });
});

router.post('/groups/join', async (req, res) => {
  const inviteCode = String(req.body?.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6,8}$/.test(inviteCode)) throw new HttpError(400, 'Enter the 7-character invite code.');
  const group = await SplitGroup.findOne({ inviteCode, archived: false });
  if (!group) throw new HttpError(404, 'No active group with that code.');
  if (group.members.some((m) => m.userId && String(m.userId) === req.user.id)) {
    return res.json({ message: 'You are already in this group.', id: group._id });
  }
  const user = await User.findById(req.user.id).lean();
  // Claim the guest seat that was created for this person, if there is one.
  const seat = group.members.find((m) => !m.userId && m.email && m.email === user.email);
  if (seat) seat.userId = user._id;
  else {
    if (group.members.length >= 50) throw new HttpError(400, 'This group is full.');
    group.members.push({ userId: user._id, name: user.displayName || user.username, email: user.email });
  }
  await group.save();
  await tellOthers(group, req.user.id, `${user.displayName || user.username} joined ${group.name}`, 'They can now see and add shared expenses.');
  res.json({ message: `Joined ${group.name}.`, id: group._id });
});

router.get('/groups/:id', async (req, res) => {
  const { group, me } = await loadGroup(req.params.id, req.user.id);
  const expenses = await SplitExpense.find({ groupId: group._id }).sort({ date: -1, createdAt: -1 }).lean();
  const bal = balances(group.members, expenses);
  const total = expenses.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0);
  res.json({
    id: group._id, name: group.name, currency: group.currency, inviteCode: group.inviteCode, archived: group.archived,
    createdBy: group.createdBy, me: String(me._id),
    members: group.members.map((m) => ({ id: m._id, name: m.name, email: m.email, isUser: !!m.userId, isMe: String(m._id) === String(me._id) })),
    balances: bal, settleUp: simplify(bal), totalSpent: Math.round(total * 100) / 100,
    expenses: expenses.map((e) => ({ ...e, id: e._id })),
  });
});

router.patch('/groups/:id', async (req, res) => {
  const { group } = await loadGroup(req.params.id, req.user.id);
  if (typeof req.body?.name === 'string' && req.body.name.trim()) group.name = req.body.name.trim().slice(0, 80);
  if (typeof req.body?.archived === 'boolean') group.archived = req.body.archived;
  await group.save();
  res.json({ message: 'Group updated.' });
});

router.post('/groups/:id/members', validate(splitMemberSchema), async (req, res) => {
  const { group } = await loadGroup(req.params.id, req.user.id);
  if (group.members.length >= 50) throw new HttpError(400, 'A group can have at most 50 members.');
  const email = (req.body.email || '').toLowerCase();
  if (email && group.members.some((m) => m.email === email)) throw new HttpError(409, 'That person is already in the group.');
  group.members.push({ name: req.body.name, email });
  await group.save();
  const m = group.members[group.members.length - 1];
  res.status(201).json({ id: m._id, name: m.name, email: m.email, isUser: false });
});

router.delete('/groups/:id/members/:mid', async (req, res) => {
  const { group, me } = await loadGroup(req.params.id, req.user.id);
  const member = group.members.id(req.params.mid);
  if (!member) throw new HttpError(404, 'Member not found.');
  if (String(member._id) === String(me._id)) throw new HttpError(400, 'Use “Leave group” to remove yourself.');
  const expenses = await SplitExpense.find({ groupId: group._id }).lean();
  const involved = expenses.some((e) => String(e.paidByMemberId) === String(member._id) || e.shares.some((s) => String(s.memberId) === String(member._id)));
  if (involved) throw new HttpError(400, `${member.name} is part of existing expenses. Delete or settle those first.`);
  member.deleteOne();
  await group.save();
  res.json({ message: 'Member removed.' });
});

router.post('/groups/:id/expenses', validate(splitExpenseSchema), async (req, res) => {
  const { group, me } = await loadGroup(req.params.id, req.user.id);
  if (group.archived) throw new HttpError(400, 'This group is archived.');
  const ids = memberIds(group);
  const b = req.body;
  if (!ids.has(String(b.paidByMemberId))) throw new HttpError(400, 'The payer is not in this group.');
  for (const p of b.participants) {
    if (!ids.has(String(typeof p === 'object' ? p.memberId : p))) throw new HttpError(400, 'Everyone in the split must be in the group.');
  }
  const shares = computeShares(b.amount, b.splitMethod, b.participants);
  const expense = await SplitExpense.create({
    groupId: group._id, kind: 'expense', description: b.description, amount: b.amount,
    paidByMemberId: b.paidByMemberId, splitMethod: b.splitMethod, shares, category: b.category,
    date: b.date ? new Date(Date.parse(b.date)) : new Date(), createdBy: req.user.id,
  });
  await SplitGroup.updateOne({ _id: group._id }, { $currentDate: { updatedAt: true } });

  // Optionally record my own share as a personal expense, so my budgets see it.
  let personal = null;
  const myShare = shares.find((s) => String(s.memberId) === String(me._id));
  if (b.addToMyExpenses && myShare && myShare.amount > 0) {
    const { transaction } = await ledger.createTransaction(req.user, {
      type: 'expense', category: b.category || 'Other', amount: myShare.amount, currency: group.currency,
      date: expense.date, description: `${b.description} (${group.name})`, tags: ['split'],
      clientId: `split-${expense._id}`,
    }, { source: 'split' });
    personal = transaction._id;
  }

  const payer = group.members.id(b.paidByMemberId);
  await tellOthers(group, req.user.id, `New expense in ${group.name}`,
    `${payer?.name || 'Someone'} paid ${formatMoney(b.amount, group.currency)} for “${b.description}”.`);
  res.status(201).json({ ...expense.toObject(), id: expense._id, personalTransactionId: personal });
});

router.delete('/groups/:id/expenses/:eid', async (req, res) => {
  const { group } = await loadGroup(req.params.id, req.user.id);
  if (!mongoose.isValidObjectId(req.params.eid)) throw new HttpError(400, 'Invalid expense id.');
  const e = await SplitExpense.findOne({ _id: req.params.eid, groupId: group._id });
  if (!e) throw new HttpError(404, 'Expense not found.');
  if (String(e.createdBy) !== req.user.id && String(group.createdBy) !== req.user.id) {
    throw new HttpError(403, 'Only the person who added it or the group owner can delete this.');
  }
  await e.deleteOne();
  res.json({ message: 'Deleted.' });
});

router.post('/groups/:id/settle', validate(settlementSchema), async (req, res) => {
  const { group } = await loadGroup(req.params.id, req.user.id);
  const ids = memberIds(group);
  const { fromMemberId, toMemberId, amount, date } = req.body;
  if (!ids.has(fromMemberId) || !ids.has(toMemberId)) throw new HttpError(400, 'Both people must be in the group.');
  const from = group.members.id(fromMemberId);
  const to = group.members.id(toMemberId);
  const s = await SplitExpense.create({
    groupId: group._id, kind: 'settlement', description: `${from.name} paid ${to.name}`, amount,
    paidByMemberId: fromMemberId, splitMethod: 'exact', shares: [{ memberId: toMemberId, amount }],
    category: 'Settlement', date: date ? new Date(Date.parse(date)) : new Date(), createdBy: req.user.id,
  });
  await tellOthers(group, req.user.id, `Settle-up in ${group.name}`, `${from.name} paid ${to.name} ${formatMoney(amount, group.currency)}.`);
  res.status(201).json({ ...s.toObject(), id: s._id });
});

router.post('/groups/:id/leave', async (req, res) => {
  const { group, me } = await loadGroup(req.params.id, req.user.id);
  const expenses = await SplitExpense.find({ groupId: group._id }).lean();
  const mine = balances(group.members, expenses).find((b) => b.memberId === String(me._id));
  if (mine && Math.abs(mine.net) >= 0.01) throw new HttpError(400, 'Settle up your balance before leaving.');
  // Stay in history as a guest name so past expenses still read correctly.
  me.userId = null;
  if (!group.members.some((m) => m.userId)) group.archived = true;
  await group.save();
  res.json({ message: `You left ${group.name}.` });
});

module.exports = router;

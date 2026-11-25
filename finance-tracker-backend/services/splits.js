/**
 * services/splits.js — the arithmetic behind shared expenses.
 *
 * All money is handled in integer cents internally so a 100.00 bill split three
 * ways becomes 33.34 + 33.33 + 33.33, never 99.99 or 100.01.
 */
const { HttpError } = require('../lib/http');

const toCents = (n) => Math.round(Number(n) * 100);
const fromCents = (c) => c / 100;

/** Spreads `total` cents over `weights` proportionally; leftover cents go to the largest remainders. */
const apportion = (total, weights) => {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new HttpError(400, 'Split weights must add up to more than zero.');
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floors[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) floors[order[k][1]]++;
  return floors;
};

/**
 * Builds the `shares` array for an expense.
 *   method 'equal'   — participants: [memberId]
 *   method 'exact'   — participants: [{ memberId, value }] values are amounts, must sum to amount
 *   method 'percent' — values are percentages, must sum to 100
 *   method 'shares'  — values are weights (e.g. 2 nights vs 3 nights)
 */
const computeShares = (amount, method, participants) => {
  const total = toCents(amount);
  if (!(total > 0)) throw new HttpError(400, 'Amount must be greater than zero.');
  if (!Array.isArray(participants) || participants.length === 0) throw new HttpError(400, 'Choose at least one person to split with.');

  const ids = participants.map((p) => String(typeof p === 'object' ? p.memberId : p));
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Each person can appear only once in a split.');

  let cents;
  if (method === 'equal') {
    cents = apportion(total, ids.map(() => 1));
  } else {
    const values = participants.map((p) => Number(p.value));
    if (values.some((v) => !Number.isFinite(v) || v < 0)) throw new HttpError(400, 'Split values must be zero or more.');
    if (method === 'exact') {
      cents = values.map(toCents);
      const sum = cents.reduce((a, b) => a + b, 0);
      if (sum !== total) throw new HttpError(400, `Exact amounts add up to ${fromCents(sum)}, not ${fromCents(total)}.`);
    } else if (method === 'percent') {
      const sum = values.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.01) throw new HttpError(400, `Percentages add up to ${sum}%, not 100%.`);
      cents = apportion(total, values);
    } else if (method === 'shares') {
      cents = apportion(total, values);
    } else {
      throw new HttpError(400, 'Unknown split method.');
    }
  }
  return ids.map((memberId, i) => ({ memberId, amount: fromCents(cents[i]) })).filter((s) => s.amount > 0);
};

/**
 * Net balance per member: positive = is owed money, negative = owes money.
 * Expenses: payer +amount, each share −share. Settlements use the same rule.
 */
const balances = (members, expenses) => {
  const net = new Map(members.map((m) => [String(m._id), 0]));
  for (const e of expenses) {
    const payer = String(e.paidByMemberId);
    if (net.has(payer)) net.set(payer, net.get(payer) + toCents(e.amount));
    for (const s of e.shares) {
      const id = String(s.memberId);
      if (net.has(id)) net.set(id, net.get(id) - toCents(s.amount));
    }
  }
  return members.map((m) => ({ memberId: String(m._id), name: m.name, userId: m.userId ? String(m.userId) : null, net: fromCents(net.get(String(m._id))) }));
};

/**
 * Minimal set of payments that settles everyone (greedy: largest debtor pays
 * largest creditor). At most n−1 payments for n people.
 */
const simplify = (balanceList) => {
  const debtors = balanceList.filter((b) => b.net < -0.004).map((b) => ({ ...b, c: -toCents(b.net) })).sort((a, b) => b.c - a.c);
  const creditors = balanceList.filter((b) => b.net > 0.004).map((b) => ({ ...b, c: toCents(b.net) })).sort((a, b) => b.c - a.c);
  const out = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].c, creditors[j].c);
    if (pay > 0) out.push({ from: debtors[i].memberId, fromName: debtors[i].name, to: creditors[j].memberId, toName: creditors[j].name, amount: fromCents(pay) });
    debtors[i].c -= pay;
    creditors[j].c -= pay;
    if (debtors[i].c === 0) i++;
    if (creditors[j].c === 0) j++;
  }
  return out;
};

module.exports = { computeShares, balances, simplify, apportion, toCents, fromCents };

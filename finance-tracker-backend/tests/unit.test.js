/**
 * Pure-function tests: split arithmetic, recurrence dates, timezone periods.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeShares, balances, simplify } = require('../services/splits');
const { nextOccurrence, dueOccurrences } = require('../cron/recurringJob');
const { monthRange, localDayKey } = require('../services/periods');

test('equal split distributes leftover cents and sums exactly', () => {
  const s = computeShares(100, 'equal', ['a'.repeat(24), 'b'.repeat(24), 'c'.repeat(24)]);
  assert.equal(Math.round(s.reduce((t, x) => t + x.amount, 0) * 100), 10000);
  assert.deepEqual(s.map((x) => x.amount).sort(), [33.33, 33.33, 33.34]);
});

test('percent split must total 100', () => {
  assert.throws(() => computeShares(50, 'percent', [{ memberId: 'a'.repeat(24), value: 40 }, { memberId: 'b'.repeat(24), value: 40 }]));
  const ok = computeShares(50, 'percent', [{ memberId: 'a'.repeat(24), value: 60 }, { memberId: 'b'.repeat(24), value: 40 }]);
  assert.deepEqual(ok.map((x) => x.amount), [30, 20]);
});

test('simplify settles everyone in at most n-1 payments', () => {
  const m = ['a', 'b', 'c', 'd'].map((n) => ({ _id: n.repeat(24), name: n }));
  const ex = [
    { amount: 120, paidByMemberId: m[0]._id, shares: m.map((x) => ({ memberId: x._id, amount: 30 })) },
    { amount: 40, paidByMemberId: m[1]._id, shares: [{ memberId: m[2]._id, amount: 40 }] },
  ];
  const bal = balances(m, ex);
  assert.equal(Math.round(bal.reduce((t, b) => t + b.net, 0) * 100), 0);
  const pays = simplify(bal);
  assert.ok(pays.length <= 3);
  const after = Object.fromEntries(bal.map((b) => [b.memberId, b.net]));
  for (const p of pays) { after[p.from] += p.amount; after[p.to] -= p.amount; }
  for (const v of Object.values(after)) assert.ok(Math.abs(v) < 0.005);
});

test('monthly recurrence on the 31st lands on the last day of short months', () => {
  const anchor = new Date(Date.UTC(2026, 0, 31));
  const feb = nextOccurrence(anchor, anchor, 'monthly');
  assert.equal(feb.toISOString().slice(0, 10), '2026-02-28');
  const mar = nextOccurrence(feb, anchor, 'monthly');
  assert.equal(mar.toISOString().slice(0, 10), '2026-03-31');
});

test('missed days are caught up, never duplicated', () => {
  const tmpl = { date: new Date(Date.UTC(2026, 10, 1)), frequency: 'daily', recurrenceLastRun: new Date(Date.UTC(2026, 10, 1)) };
  const due = dueOccurrences(tmpl, new Date(Date.UTC(2026, 10, 5)));
  assert.deepEqual(due.map((d) => d.toISOString().slice(0, 10)), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
  const again = dueOccurrences({ ...tmpl, recurrenceLastRun: due[due.length - 1] }, new Date(Date.UTC(2026, 10, 5)));
  assert.equal(again.length, 0);
});

test('legacy templates without lastRun only fire from today onward', () => {
  const tmpl = { date: new Date(Date.UTC(2026, 0, 1)), frequency: 'daily', recurrenceLastRun: null };
  const due = dueOccurrences(tmpl, new Date(Date.UTC(2026, 10, 5)));
  assert.deepEqual(due.map((d) => d.toISOString().slice(0, 10)), ['2026-11-05']);
});

test('month boundaries respect the user timezone', () => {
  // 2026-11-30 20:00 UTC is already December 1st in Tokyo.
  const instant = new Date(Date.UTC(2026, 10, 30, 20));
  assert.equal(localDayKey(instant, 'Asia/Tokyo'), '2026-12-01');
  const { from } = monthRange(instant, 'Asia/Tokyo');
  assert.equal(from.toISOString(), '2026-11-30T15:00:00.000Z');
});

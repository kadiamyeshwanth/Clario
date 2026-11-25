/**
 * End-to-end API tests: real Express app, real MongoDB (in-memory).
 * Run: npm test
 */
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, newUser, request } = require('./helpers');

before(setup, { timeout: 120000 });
after(teardown);

describe('auth', () => {
  test('register returns access + refresh tokens and a public user', async () => {
    const u = await newUser({ currency: 'USD', timezone: 'America/New_York' });
    assert.ok(u.accessToken && u.refreshToken && u.sessionId);
    assert.equal(u.user.preferences.currency, 'USD');
    assert.equal(u.user.preferences.timezone, 'America/New_York');
    assert.equal(u.user.password, undefined);
  });

  test('duplicate email is rejected', async () => {
    const u = await newUser();
    const res = await request().post('/api/auth/register').send({ username: 'someone_else', email: u.user.email, password: 'CorrectHorse9' });
    assert.equal(res.status, 409);
  });

  test('login works with email, wrong password is vague, and repeated failures lock', async () => {
    const u = await newUser();
    const ok = await request().post('/api/auth/login').send({ username: u.user.email, password: u.password });
    assert.equal(ok.status, 200);
    for (let i = 0; i < 8; i++) {
      const bad = await request().post('/api/auth/login').send({ username: u.user.username, password: 'wrong-password' });
      assert.equal(bad.status, 401);
      assert.equal(bad.body.error, 'Invalid credentials.');
    }
    const locked = await request().post('/api/auth/login').send({ username: u.user.username, password: u.password });
    assert.equal(locked.status, 429);
  });

  test('refresh rotates, and replaying an old refresh token revokes the session', async () => {
    const u = await newUser();
    const r1 = await request().post('/api/auth/refresh').send({ refreshToken: u.refreshToken });
    assert.equal(r1.status, 200);
    assert.notEqual(r1.body.refreshToken, u.refreshToken);

    const replay = await request().post('/api/auth/refresh').send({ refreshToken: u.refreshToken });
    assert.equal(replay.status, 401);
    // The legitimate new token is now dead too: the session was revoked.
    const after = await request().post('/api/auth/refresh').send({ refreshToken: r1.body.refreshToken });
    assert.equal(after.status, 401);
  });

  test('logout revokes the refresh token', async () => {
    const u = await newUser();
    await request().post('/api/auth/logout').send({ refreshToken: u.refreshToken }).expect(200);
    const res = await request().post('/api/auth/refresh').send({ refreshToken: u.refreshToken });
    assert.equal(res.status, 401);
  });

  test('protected routes need a token', async () => {
    const res = await request().get('/api/transactions');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'no_token');
  });
});

describe('transactions + wallets', () => {
  test('wallet balance follows create, edit and delete', async () => {
    const u = await newUser();
    const w = await u.api.post('/api/wallets', { name: 'Bank', balance: 1000 });
    assert.equal(w.status, 201);
    const walletId = w.body.id;

    const t = await u.api.post('/api/transactions', { type: 'expense', category: 'Food', amount: 200, date: '2026-11-01', walletId });
    assert.equal(t.status, 201);
    let wallets = (await u.api.get('/api/wallets')).body;
    assert.equal(wallets.data[0].balance, 800);

    await u.api.patch(`/api/transactions/${t.body.transaction._id}`, { amount: 50 }).expect(200);
    wallets = (await u.api.get('/api/wallets')).body;
    assert.equal(wallets.data[0].balance, 950);

    await u.api.patch(`/api/transactions/${t.body.transaction._id}`, { type: 'income' }).expect(200);
    wallets = (await u.api.get('/api/wallets')).body;
    assert.equal(wallets.data[0].balance, 1050);

    await u.api.del(`/api/transactions/${t.body.transaction._id}`).expect(200);
    wallets = (await u.api.get('/api/wallets')).body;
    assert.equal(wallets.data[0].balance, 1000);
  });

  test('partial edit keeps tags and other fields', async () => {
    const u = await newUser();
    const t = await u.api.post('/api/transactions', { type: 'expense', category: 'Food', amount: 10, date: '2026-11-02', tags: ['lunch', 'work'], merchant: 'Cafe' });
    const res = await u.api.patch(`/api/transactions/${t.body.transaction._id}`, { amount: 12 });
    assert.deepEqual(res.body.transaction.tags, ['lunch', 'work']);
    assert.equal(res.body.transaction.merchant, 'Cafe');
    assert.equal(res.body.transaction.amount, 12);
  });

  test('foreign-currency expense is converted and keeps its original amount', async () => {
    const u = await newUser({ currency: 'INR' });
    const res = await u.api.post('/api/transactions', { type: 'expense', category: 'Travel', amount: 10, currency: 'USD', date: '2026-11-03' });
    assert.equal(res.status, 201);
    const t = res.body.transaction;
    assert.equal(t.originalAmount, 10);
    assert.equal(t.originalCurrency, 'USD');
    assert.ok(t.amount > 500 && t.amount < 1500, `converted amount ${t.amount}`);
  });

  test('clientId makes creation idempotent (offline retry)', async () => {
    const u = await newUser();
    const body = { type: 'expense', category: 'Food', amount: 5, date: '2026-11-04', clientId: 'offline-abc-12345' };
    const a = await u.api.post('/api/transactions', body);
    const b = await u.api.post('/api/transactions', body);
    assert.equal(a.status, 201);
    assert.equal(b.status, 200);
    assert.equal(a.body.transaction._id, b.body.transaction._id);
  });

  test('search treats input as text, not a regular expression', async () => {
    const u = await newUser();
    await u.api.post('/api/transactions', { type: 'expense', category: 'Food', amount: 5, date: '2026-11-04', description: 'a+b (combo)' }).expect(201);
    const hit = await u.api.get('/api/transactions?search=' + encodeURIComponent('a+b (combo)'));
    assert.equal(hit.status, 200);
    assert.equal(hit.body.total, 1);
    const bad = await u.api.get('/api/transactions?search=' + encodeURIComponent('(.*)+$'));
    assert.equal(bad.status, 200);
    assert.equal(bad.body.total, 0);
  });

  test('users cannot see or touch each other’s rows', async () => {
    const a = await newUser();
    const b = await newUser();
    const t = await a.api.post('/api/transactions', { type: 'expense', category: 'Food', amount: 5, date: '2026-11-04' });
    assert.equal((await b.api.get(`/api/transactions/${t.body.transaction._id}`)).status, 404);
    assert.equal((await b.api.del(`/api/transactions/${t.body.transaction._id}`)).status, 404);
  });

  test('wallet PATCH cannot reassign ownership', async () => {
    const a = await newUser();
    const b = await newUser();
    const w = await a.api.post('/api/wallets', { name: 'Mine', balance: 1 });
    await a.api.patch(`/api/wallets/${w.body.id}`, { userId: b.user.id, name: 'Renamed' }).expect(200);
    const list = (await a.api.get('/api/wallets')).body.data;
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Renamed');
    assert.equal((await b.api.get('/api/wallets')).body.data.length, 0);
  });

  test('transfers move money between wallets without touching income/expense', async () => {
    const u = await newUser();
    const a = (await u.api.post('/api/wallets', { name: 'Checking', balance: 500 })).body;
    const b = (await u.api.post('/api/wallets', { name: 'Savings', balance: 0 })).body;
    await u.api.post('/api/wallets/transfer', { fromWalletId: a.id, toWalletId: b.id, amount: 200 }).expect(201);
    const list = (await u.api.get('/api/wallets')).body;
    assert.equal(list.totalBalance, 500);
    assert.deepEqual(list.data.map((w) => w.balance).sort(), [200, 300]);
    const summary = (await u.api.get('/api/transactions/summary')).body;
    assert.equal(summary.income + summary.expenses, 0);
  });

  test('CSV export neutralises spreadsheet formulas', async () => {
    const u = await newUser();
    await u.api.post('/api/transactions', { type: 'expense', category: 'Food', amount: 5, date: '2026-11-04', description: '=HYPERLINK("x")' }).expect(201);
    const res = await u.api.get('/api/transactions/export.csv');
    assert.equal(res.status, 200);
    assert.match(res.text, /"'=HYPERLINK/);
  });
});

describe('budgets', () => {
  test('status measures this month only, not all-time', async () => {
    const u = await newUser({ timezone: 'UTC' });
    const now = new Date();
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 10)).toISOString().slice(0, 10);
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12)).toISOString();
    await u.api.post('/api/budgets/add', { category: 'Food', limit: 100 }).expect(200);
    await u.api.post('/api/transactions', { type: 'expense', category: 'Food', amount: 500, date: lastMonth }).expect(201);
    await u.api.post('/api/transactions', { type: 'expense', category: 'Food', amount: 30, date: thisMonth }).expect(201);
    const [b] = (await u.api.get('/api/budgets')).body;
    assert.equal(b.spent, 30);
    assert.equal(b.state, 'ok');
  });
});

describe('splits', () => {
  test('three-way split, balances, settle-up suggestions, and join by code', async () => {
    const owner = await newUser({ currency: 'EUR' });
    const friend = await newUser();
    const g = await owner.api.post('/api/splits/groups', { name: 'Lisbon trip', members: [{ name: 'Ana', email: friend.user.email }, { name: 'Ben' }] });
    assert.equal(g.status, 201);
    assert.equal(g.body.currency, 'EUR');

    let detail = (await owner.api.get(`/api/splits/groups/${g.body.id}`)).body;
    const [me, ana, ben] = detail.members;
    await owner.api.post(`/api/splits/groups/${g.body.id}/expenses`, {
      description: 'Apartment', amount: 100, paidByMemberId: me.id, splitMethod: 'equal', participants: [me.id, ana.id, ben.id],
    }).expect(201);

    detail = (await owner.api.get(`/api/splits/groups/${g.body.id}`)).body;
    const net = Object.fromEntries(detail.balances.map((b) => [b.name, b.net]));
    assert.equal(Math.round((net[ana.name] + net[ben.name] + net[me.name]) * 100), 0);
    assert.ok(Math.abs(net[me.name] - 66.66) < 0.011 || Math.abs(net[me.name] - 66.67) < 0.011);
    assert.equal(detail.settleUp.length, 2);

    // Ana signs up later and claims her seat with the invite code.
    const joined = await friend.api.post('/api/splits/groups/join', { code: detail.inviteCode });
    assert.equal(joined.status, 200);
    const fd = (await friend.api.get(`/api/splits/groups/${g.body.id}`)).body;
    assert.equal(fd.members.length, 3);
    assert.equal(fd.members.find((m) => m.isMe).name, 'Ana');

    // Ana settles her share.
    const anaOwes = -fd.balances.find((b) => b.name === 'Ana').net;
    await friend.api.post(`/api/splits/groups/${g.body.id}/settle`, { fromMemberId: ana.id, toMemberId: me.id, amount: anaOwes }).expect(201);
    const after = (await owner.api.get(`/api/splits/groups/${g.body.id}`)).body;
    assert.equal(after.balances.find((b) => b.name === 'Ana').net, 0);
  });

  test('exact split must add up', async () => {
    const u = await newUser();
    const g = (await u.api.post('/api/splits/groups', { name: 'Flat', members: [{ name: 'Sam' }] })).body;
    const d = (await u.api.get(`/api/splits/groups/${g.id}`)).body;
    const res = await u.api.post(`/api/splits/groups/${g.id}/expenses`, {
      description: 'Rent', amount: 100, paidByMemberId: d.members[0].id, splitMethod: 'exact',
      participants: [{ memberId: d.members[0].id, value: 60 }, { memberId: d.members[1].id, value: 30 }],
    });
    assert.equal(res.status, 400);
  });

  test('non-members cannot read a group', async () => {
    const a = await newUser();
    const b = await newUser();
    const g = (await a.api.post('/api/splits/groups', { name: 'Private', members: [] })).body;
    assert.equal((await b.api.get(`/api/splits/groups/${g.id}`)).status, 404);
  });
});

describe('challenges', () => {
  test('join, see live progress, and refuse duplicates', async () => {
    const u = await newUser();
    const cat = (await u.api.get('/api/challenges/catalogue')).body;
    assert.ok(cat.length >= 5);
    const j = await u.api.post('/api/challenges/join', { key: 'no_spend_week' });
    assert.equal(j.status, 201);
    assert.equal(j.body.progress.target, 3);
    assert.equal((await u.api.post('/api/challenges/join', { key: 'no_spend_week' })).status, 409);
    const list = (await u.api.get('/api/challenges')).body;
    assert.equal(list.length, 1);
    assert.ok(typeof list[0].progress.pct === 'number');
  });
});

describe('preferences, overview, export, deletion', () => {
  test('changing base currency can convert history', async () => {
    const u = await newUser({ currency: 'USD' });
    await u.api.post('/api/transactions', { type: 'expense', category: 'Food', amount: 10, date: '2026-11-04' }).expect(201);
    const res = await u.api.patch('/api/users/preferences', { currency: 'INR', convertExisting: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.preferences.currency, 'INR');
    const list = (await u.api.get('/api/transactions?limit=0')).body.data;
    assert.ok(list[0].amount > 500);
  });

  test('switching currency restores exact amounts for rows entered in that currency', async () => {
    const u = await newUser({ currency: 'USD' });
    await u.api.post('/api/transactions', { type: 'expense', category: 'Food', amount: 2000, currency: 'INR', date: '2026-11-04' }).expect(201);
    await u.api.patch('/api/users/preferences', { currency: 'INR', convertExisting: true }).expect(200);
    const [t] = (await u.api.get('/api/transactions?limit=0')).body.data;
    assert.equal(t.amount, 2000);
    assert.equal(t.originalCurrency, null);
  });

  test('overview returns a month in one call', async () => {
    const u = await newUser({ timezone: 'UTC' });
    await u.api.post('/api/transactions', { type: 'income', category: 'Salary', amount: 1000, date: new Date().toISOString() }).expect(201);
    await u.api.post('/api/transactions', { type: 'expense', category: 'Food', amount: 250, date: new Date().toISOString() }).expect(201);
    const o = (await u.api.get('/api/meta/overview')).body;
    assert.equal(o.totals.income, 1000);
    assert.equal(o.totals.expenses, 250);
    assert.equal(o.totals.savingsRate, 75);
    assert.equal(o.categories[0].name, 'Food');
    assert.ok(o.healthScore >= 0 && o.healthScore <= 100);
  });

  test('export includes every owned collection; delete needs the password and removes everything', async () => {
    const u = await newUser();
    await u.api.post('/api/wallets', { name: 'Cash', balance: 10 }).expect(201);
    await u.api.post('/api/transactions', { type: 'expense', category: 'Food', amount: 5, date: '2026-11-04' }).expect(201);
    const exp = (await u.api.get('/api/users/export')).body;
    assert.equal(exp.transactions.length, 1);
    assert.equal(exp.wallets.length, 1);

    assert.equal((await u.api.del('/api/users/account', { password: 'nope' })).status, 401);
    await u.api.del('/api/users/account', { password: u.password }).expect(200);
    const login = await request().post('/api/auth/login').send({ username: u.user.username, password: u.password });
    assert.equal(login.status, 401);
  });
});

describe('sms webhook', () => {
  test('imports a bank SMS once, with INR conversion for a non-INR user', async () => {
    const u = await newUser({ currency: 'INR' });
    const setup = (await u.api.get('/api/sms/setup')).body;
    const sms = { from: 'VM-HDFCBK', message: 'Rs.450.00 debited from a/c XX1234 on 03-11-26 to VPA swiggy@icici. UPI Ref 123' };
    const first = await request().post(`/api/sms/webhook/${setup.token}`).send(sms);
    assert.equal(first.status, 201);
    const again = await request().post(`/api/sms/webhook/${setup.token}`).send(sms);
    assert.equal(again.body.status, 'duplicate');
    const hist = (await u.api.get('/api/sms/history')).body;
    assert.equal(hist.length, 1);
    assert.equal(hist[0].amount, 450);
  });

  test('inbox backfill: counts, dedupes against live SMS and across bank + UPI app', async () => {
    const u = await newUser({ currency: 'INR' });
    const { token } = (await u.api.get('/api/sms/setup')).body;
    const t0 = Date.UTC(2026, 10, 10, 9, 30);
    const live = { address: 'VM-HDFCBK-S', body: 'Sent Rs.250.00 From HDFC Bank A/C *1234 To ZOMATO On 10/11/26 Ref 630712345678', date: t0 };
    await request().post(`/api/sms/webhook/${token}`).send({ from: live.address, message: live.body, timestamp: live.date }).expect(201);

    const res = await u.api.post('/api/sms/import', { messages: [
      live,                                                                                     // already imported live
      { address: 'JX-SBIUPI', body: 'Dear UPI user A/C X1234 debited by 120.0 on date 11Nov26 trf to ramesh kumar Refno 431012345678 -SBI', date: t0 + 864e5 },
      { address: 'AD-PHONEPE', body: 'Paid Rs.120 to ramesh kumar from A/c XX1234. UPI Ref No 431012345678', date: t0 + 864e5 + 60e3 }, // same payment, other sender
      { address: 'VM-HDFCBK', body: '482913 is the OTP for your txn of Rs.999 at AMAZON. Do not share.', date: t0 },
      { address: 'VM-HDFCBK', body: 'Update! INR 85,000.00 deposited in HDFC Bank A/c XX1234 on 01-NOV-26 for NEFT Cr-ACME TECHNOLOGIES PVT LTD.', date: Date.UTC(2026, 10, 1, 4) },
    ] });
    assert.equal(res.status, 200);
    assert.deepEqual({ created: res.body.created, duplicate: res.body.duplicate, skipped: res.body.skipped }, { created: 2, duplicate: 2, skipped: 1 });

    const hist = (await u.api.get('/api/sms/history')).body;
    assert.equal(hist.length, 3);
    const salary = hist.find((t) => t.type === 'income');
    assert.equal(salary.amount, 85000);
    assert.equal(salary.merchant, 'Acme Technologies Pvt Ltd');
    assert.ok(res.body.skippedReasons && Object.values(res.body.skippedReasons).reduce((a, b) => a + b, 0) === 1);
  });

  test('repeat debits with different balances stay separate; true duplicates merge (also for non-INR users)', async () => {
    const u = await newUser({ currency: 'USD' });
    const t0 = Date.UTC(2026, 10, 25, 2, 40);
    const debit = (bal, sender, min) => ({ address: sender, date: t0 + min * 60e3,
      body: `An amount of INR 2,000.00 has been DEBITED to your account XXXX1234 on 25/11/2026. Total Avail.bal INR ${bal}.. Dial 1930 to report cyber fraud- Canara Bank` });
    const res = await u.api.post('/api/sms/import', { messages: [
      debit('11,729.32', 'AD-CANBNK-S', 0),
      debit('7,729.32', 'JK-CANBNK-S', 1),      // different balance → a second real payment
      debit('5,729.32', 'JK-CANBNK-S', 3),      // third real payment
      { address: 'AD-PHONEPE', date: t0 + 4 * 60e3, body: 'Paid Rs.2000 to shop from A/c XX1234. UPI Ref No 431012345678' }, // no balance → same money as a bank SMS
    ] });
    assert.deepEqual({ created: res.body.created, duplicate: res.body.duplicate }, { created: 3, duplicate: 1 });
  });

  test('a bad token is rejected', async () => {
    const res = await request().post('/api/sms/webhook/not-a-real-token').send({ message: 'Rs 10 debited' });
    assert.equal(res.status, 401);
  });
});

describe('hardening', () => {
  test('operator keys in JSON bodies are stripped', async () => {
    const res = await request().post('/api/auth/login').send({ username: { $ne: null }, password: { $ne: null } });
    assert.equal(res.status, 400);
  });

  test('malformed JSON gets a clean 400', async () => {
    const res = await request().post('/api/auth/login').set('Content-Type', 'application/json').send('{bad json');
    assert.equal(res.status, 400);
    assert.ok(res.body.requestId);
  });

  test('health reports the database', async () => {
    const res = await request().get('/api/v1/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.database, 'connected');
  });
});

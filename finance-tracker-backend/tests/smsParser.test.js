/**
 * Bank / UPI SMS parsing against real-world message shapes (numbers changed).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSms, isBankSender } = require('../utils/smsParser');

const ok = (sender, text, expect) => {
  const r = parseSms(text, sender);
  assert.ok(!r.skip, `expected a transaction, got skip "${r.skip}" for: ${text}`);
  for (const [k, v] of Object.entries(expect)) {
    if (k === 'date') assert.equal(r.date?.toISOString().slice(0, 10), v, `date for: ${text}`);
    else assert.equal(r[k], v, `${k} for: ${text}`);
  }
  return r;
};
const skip = (sender, text) => {
  const r = parseSms(text, sender);
  assert.ok(r.skip, `expected skip, got ${JSON.stringify(r)} for: ${text}`);
};

test('DLT sender IDs are recognised (the old whitelist rejected most of these)', () => {
  for (const s of ['AX-CANBNK-S', 'JM-CANBNK-S', 'VM-SOMEBNK', 'JX-SBIUPI', 'VM-HDFCBK-S', 'AD-ICICIT', 'JD-AXISBK', 'BZ-KOTAKB', 'VK-BOIIND', 'AX-PNBSMS', 'JM-BOBTXN', 'CP-PAYTMB', 'VM-IDFCFB', 'AD-YESBNK-S', 'JK-FEDBNK'])
    assert.ok(isBankSender(s), s);
  for (const s of ['+919876543210', 'VM-ZOMATO', 'AD-MYNTRA', 'JX-SWIGGY', 'VM-ITDCPC-G', 'AD-CYRIXH-S'])
    assert.ok(!isBankSender(s), s);
});

test('HDFC UPI debit', () => ok('VM-HDFCBK-S',
  'Sent Rs.450.00 From HDFC Bank A/C *1234 To SWIGGY LIMITED On 03/11/26 Ref 630712345678 Not You? Call 18002586161/SMS BLOCK UPI to 7308080808',
  { amount: 450, type: 'expense', merchant: 'Swiggy Limited', date: '2026-11-03' }));

test('SBI UPI debit with VPA', () => ok('JX-SBIUPI',
  'Dear UPI user A/C X1234 debited by 120.0 on date 05Nov26 trf to ramesh kumar Refno 431012345678. If not u? call 1800111109. -SBI',
  { type: 'expense' }));

test('SBI debit "Rs" form with VPA', () => ok('AD-SBIINB',
  'Your A/C XXXXX1234 Debited INR 1,299.00 on 07/11/26 -Transferred to amazonpay@apl. Avl Balance INR 23,456.78',
  { amount: 1299, type: 'expense', merchant: 'Amazonpay', date: '2026-11-07' }));

test('ICICI card spend picks the spend, not the available limit', () => ok('AD-ICICIT',
  'INR 2,340.00 spent using ICICI Bank Card XX9876 on 08-Nov-26 on UBER INDIA. Avl Limit: INR 1,12,000.00. If not you, call 1800 2662/SMS BLOCK 9876 to 9215676766',
  { amount: 2340, type: 'expense', date: '2026-11-08' }));

test('Axis card spend "at" merchant', () => ok('JD-AXISBK',
  'Spent INR 899 Axis Bank Card no. XX4321 10-11-26 18:22:01 IST at DOMINOS PIZZA Avl Lmt INR 45,000 Not you? SMS BLOCK 4321 to 919951860002',
  { amount: 899, type: 'expense', merchant: 'Dominos Pizza' }));

test('salary credit', () => ok('VM-HDFCBK',
  'Update! INR 85,000.00 deposited in HDFC Bank A/c XX1234 on 01-NOV-26 for NEFT Cr-ACME TECHNOLOGIES PVT LTD. Avl bal INR 1,02,345.00',
  { amount: 85000, type: 'income', date: '2026-11-01', merchant: 'Acme Technologies Pvt Ltd' }));

test('UPI credit from a person', () => ok('BZ-KOTAKB',
  'Received Rs.500.00 in your Kotak Bank A/c X5678 from priya.s@okaxis on 12-11-26.UPI Ref:631298765432.',
  { amount: 500, type: 'income', merchant: 'Priya S' }));

test('refund is income', () => ok('AD-ICICIT',
  'Dear Customer, refund of INR 349.00 from FLIPKART has been credited to your ICICI Bank Card XX9876 on 13-Nov-26.',
  { amount: 349, type: 'income' }));

test('ATM withdrawal', () => ok('VK-BOIIND',
  'Rs.2000 withdrawn from A/c XX3456 at ATM on 14-11-2026. Avl Bal Rs 8,123.50 -Bank of India',
  { amount: 2000, type: 'expense' }));

test('message-only (no sender) still works when it reads like a bank SMS', () => ok('',
  'Rs 75.00 debited from A/c XX1111 to VPA chaiwala@ybl on 15/11/26. UPI Ref No 432112345678',
  { amount: 75, type: 'expense', merchant: 'Chaiwala' }));

test('ignores things that are not completed transactions', () => {
  skip('VM-HDFCBK', '123456 is the OTP for your transaction of Rs.4,999 at AMAZON. Valid for 5 mins. Do not share.');
  skip('JX-SBIUPI', 'Ravi has requested money from you of Rs 300.00 on Google Pay. Pay or decline the request.');
  skip('AD-ICICIT', 'Your ICICI Bank Credit Card XX9876 statement: Total Amt Due INR 12,345.00, Min Amt Due INR 620 is due on 20-Nov-26.');
  skip('VM-HDFCBK', 'Rs.649.00 will be debited from your A/c XX1234 on 18-11-26 towards NETFLIX e-mandate.');
  skip('JD-AXISBK', 'Transaction of INR 2,000 on Axis Bank Card XX4321 at MYNTRA has failed due to incorrect PIN.');
  skip('AD-HDFCBK', 'Congratulations! You are eligible for a pre-approved personal loan of Rs 5,00,000. Apply now.');
  skip('+919876543210', 'hey I sent you Rs 500 for dinner yesterday');
  skip('VM-ZOMATO', 'Your order of Rs 350 is on the way!');
  // Paying off a loan / card is a transfer, not income (seen on a real Canara phone).
  skip('JX-CANBNK-S', 'Rs.INR 16,226.86 credited to Loan A/c XXXXXXX1234. Loan A/c successfully closed on 03-NOV-26. -Canara Bank');
  skip('AD-ICICIT', 'Payment of INR 5,000.00 received towards your ICICI Bank Credit Card XX9876 on 05-Nov-26. Thank you.');
});

// Formats observed on a real phone during device testing (numbers changed).
test('Canara Bank debit and UPI credit', () => {
  ok('JK-CANBNK-S', 'An amount of INR 2,000.00 has been DEBITED to your account XXXX1234 on 25/11/2026. Total Avail.bal INR 5,729.32.. Dial 1930 to report cyber fraud- Canara Bank',
    { amount: 2000, type: 'expense', date: '2026-11-25' });
  ok('AD-CANBNK-S', 'Dear Customer, Acct XXXX1234 credited with INR 40.00 on 24/11/26 from Malle  Abhin; UPI:123456789012; Bal INR 15,729.32-CanaraBank',
    { amount: 40, type: 'income', merchant: 'Malle Abhin' });
});

test('Canara "Dr." / "Cr." UPI format (shared by the user from a real phone; numbers changed)', () => {
  ok('AX-CANBNK-S', 'Dear Customer, Acct XXXX1234 Dr. INR 100.00 on 25/11/26 to LAVANYA PROV; UPI: 123456789012; Bal INR 5,699.32.Not you?SMS BLOCKUPI to 9901771222-CanaraBank',
    { amount: 100, type: 'expense', merchant: 'Lavanya Prov', date: '2026-11-25' });
  ok('JD-CANBNK-S', 'Dear Customer, Acct XXXX1234 Dr. INR 40.00 on 01/08/26 to PUTCHANUTALA; UPI: 123456789012; Bal INR 3,478.26.Not you?SMS BLOCKUPI to 9901771222-CanaraBank',
    { amount: 40, type: 'expense', merchant: 'Putchanutala', date: '2026-08-01' });
  ok('AD-CANBNK-S', 'Dear Customer, Acct XXXX1234 Cr. INR 250.00 on 20/11/26 from RAVI KUMAR; UPI: 123456789012; Bal INR 5,949.32-CanaraBank',
    { amount: 250, type: 'income', merchant: 'Ravi Kumar' });
});

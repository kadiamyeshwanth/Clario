/**
 * utils/smsParser.js — turns an Indian bank / UPI SMS into a transaction.
 *
 * Built from the formats banks actually send today:
 *   • DLT sender IDs look like "JX-SBIUPI", "VM-HDFCBK-S", "AD-ICICIT". The old
 *     fixed whitelist only matched a few exact IDs, so most real SMS were
 *     dropped as "non-bank sender".
 *   • Not every money SMS is a transaction: OTPs, UPI collect *requests*,
 *     "will be debited" mandate reminders, card bills "due on", failed payments
 *     and loan offers all mention an amount and must be ignored.
 *   • "Avl Bal Rs 12,000" must never be read as the amount.
 */
const { suggestCategory } = require('./categorizer');

// Sender cores (the middle part of a DLT header) for banks, wallets and UPI apps.
const LONG_KEYS = [
  'hdfc', 'icici', 'axis', 'kotak', 'kkbk', 'canara', 'canbnk', 'cnrb', 'union', 'indus', 'indbnk', 'idbi', 'yesbnk', 'yesbk',
  'federal', 'fedbnk', 'rblbnk', 'idfc', 'aubank', 'citi', 'hsbc', 'stanc', 'scbank', 'dbsbnk', 'bandhn', 'bandhan',
  'centbk', 'maha', 'mahabk', 'psbank', 'equitas', 'ujjivn', 'kvbank', 'tmbank', 'sibsms', 'dcbbnk', 'ucobnk',
  'paytm', 'phonepe', 'phnpe', 'gpay', 'googlepay', 'googpy', 'amazon', 'amzn', 'airtel', 'airbnk', 'jiopay', 'jiobnk',
  'bhim', 'mobikwik', 'mobikw', 'freecharge', 'frchrg', 'cred', 'slice', 'onecard', 'jupiter', 'niyo', 'fibank',
];
const SHORT_KEYS = ['sbi', 'boi', 'bob', 'pnb', 'iob', 'uco', 'kvb', 'tmb', 'sib', 'csb', 'cbi', 'dcb', 'rbl', 'yes', 'au'];

const senderCore = (sender = '') => {
  const parts = String(sender).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  // "JX-SBIUPI-S" → "SBIUPI"; plain "HDFCBK" stays as is.
  const core = parts.filter((p) => p.length >= 4).sort((a, b) => b.length - a.length)[0] || parts.join('');
  return core.toLowerCase();
};

const isBankSender = (sender = '') => {
  if (!sender || /^\+?\d{6,}$/.test(sender.replace(/\s/g, ''))) return false; // a phone number is a person
  const core = senderCore(sender);
  if (LONG_KEYS.some((k) => core.includes(k))) return true;
  // Most Indian bank headers end in BNK / BANK / BK (CANBNK, HDFCBK, IDFCBK…):
  // catches banks not on the list instead of silently dropping their SMS.
  if (/(bnk|bank|bk)$/.test(core) && core.length >= 5) return true;
  return SHORT_KEYS.some((k) => core.startsWith(k) || core.endsWith(k));
};

/** The message itself reads like an account statement line. */
const looksLikeBankText = (t) =>
  /(a\/c|acct|account|card|upi)[^.]{0,60}\b(debited|credited)\b|\b(debited|credited)\b[^.]{0,60}(a\/c|acct|account|card)/i.test(t) ||
  (/\bupi\b/i.test(t) && /\bref(\.|erence)?\s*(no\.?)?\s*:?\s*\d{6,}/i.test(t));

const NOT_A_TRANSACTION = [
  /\botp\b|one[\s-]?time password|verification code|\bcode is\b/i,
  /requested (money|rs|inr|₹)|has requested|collect request|request(ed)? (of|for) (rs|inr|₹)/i,
  /will be (debited|deducted|charged|auto[- ]?debited)|scheduled (for|on)|mandate|auto[- ]?pay (is )?(set|registered|scheduled)|e-?mandate/i,
  /\b(is|are) due\b|due (on|by|date)|min(imum)?\.? (amt|amount) due|total (amt|amount) due|payment due|bill (is )?generated/i,
  /\b(failed|declined|unsuccessful|could not be processed|not processed)\b/i,
  /pre-?approved|eligible for|apply now|\boffer\b|loan of|\bwin\b|cashback (of )?up to|limit (has been )?(increased|enhanced)/i,
  // Money arriving in a LOAN or CREDIT CARD account is you paying it off — a
  // transfer, not income. ("credited to Loan A/c … closed", "payment received
  // towards your credit card"). The matching debit SMS records the outflow.
  /credited to (your )?(loan|credit card|card)\b|loan a\/c[^.]{0,60}(closed|repaid)|payment (of .{1,25})?received (towards|for|on) (your )?[^.]{0,30}?(credit card|card|loan)\b|received towards (your )?[^.]{0,30}?(loan|credit card)\b/i,
];

/** Remaining balance mentioned in the SMS ("Avl Bal Rs 5,729.32"), or null. */
const balanceOf = (text) => {
  const m = String(text).match(/(?:avl\.?|avail(?:able)?\.?|total avail\.?|closing)?\s*bal(?:ance)?\.?\s*(?:is|:)?\s*(?:rs\.?|inr|₹)\s*:?\s*([\d,]+(?:\.\d{1,2})?)/i);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
};

// Regex fragments. "Dr. INR 100.00" / "Cr. INR 40.00" is how Canara Bank (and
// several others) write debit/credit — found testing on a real phone, where 14
// Canara UPI payments were skipped because only full words were recognised.
const CREDIT_WORDS = ['credited', 'received', 'deposited', 'refund', 'refunded', 'reversed', 'reversal', 'cashback of', 'cr\\.?\\s*(?:inr|rs)'];
const DEBIT_WORDS = ['debited', 'debit', 'spent', 'paid', 'sent', 'withdrawn', 'withdrawal', 'purchase', 'charged', 'deducted', 'transferred to', 'txn of', 'payment of', 'dr\\.?\\s*(?:inr|rs)'];

/** Whichever direction word appears FIRST describes the account holder's side. */
const directionOf = (text) => {
  const lower = text.toLowerCase();
  const first = (words) => Math.min(...words.map((w) => { const i = lower.search(new RegExp(`\\b${w}\\b`)); return i < 0 ? Infinity : i; }));
  const c = first(CREDIT_WORDS);
  const d = first(DEBIT_WORDS);
  if (c === Infinity && d === Infinity) return null;
  return c < d ? 'income' : 'expense';
};

const AMOUNT_RX = /(?:rs\.?|inr|₹)\s*:?\s*([\d,]+(?:\.\d{1,2})?)/gi;

/** First amount that isn't a balance / limit figure. */
const amountOf = (text) => {
  for (const m of text.matchAll(AMOUNT_RX)) {
    const before = text.slice(Math.max(0, m.index - 22), m.index).toLowerCase();
    if (/(bal|balance|limit|avl|available|outstanding)\W*$|(bal|balance|limit)\b.{0,12}$/.test(before)) continue;
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (n > 0 && Number.isFinite(n) && n < 1e9) return Math.round(n * 100) / 100;
  }
  // SBI style: "A/C X1234 debited by 120.0" — no currency marker at all.
  const bare = text.match(/\b(?:debited|credited)\s+(?:by|with|for)\s+([\d,]+(?:\.\d{1,2})?)\b/i);
  if (bare) {
    const n = parseFloat(bare[1].replace(/,/g, ''));
    if (n > 0 && n < 1e9) return Math.round(n * 100) / 100;
  }
  return null;
};

const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const year4 = (y) => (String(y).length === 2 ? 2000 + Number(y) : Number(y));
const valid = (y, m, d) => { const dt = new Date(Date.UTC(y, m, d)); return dt.getUTCMonth() === m && dt.getUTCDate() === d ? dt : null; };

/** Date written in the SMS (day precision), or null. Indian SMS are day-first. */
const dateOf = (text) => {
  let m = text.match(/\b(\d{1,2})[-\s/]?([A-Za-z]{3})[a-z]*[-\s/,]*(\d{2,4})\b/);            // 03-Nov-26, 3 Nov 2026
  if (m && MON[m[2].toLowerCase()] !== undefined) return valid(year4(m[3]), MON[m[2].toLowerCase()], Number(m[1]));
  m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);                                             // 2026-11-03
  if (m) return valid(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);                               // 03/11/26 (DD/MM)
  if (m) return valid(year4(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = text.match(/\b([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/);                         // Nov 3, 2026
  if (m && MON[m[1].toLowerCase()] !== undefined) return valid(Number(m[3]), MON[m[1].toLowerCase()], Number(m[2]));
  return null;
};

const STOP = /(?=\s+(?:on|via|using|ref|refno|upi|imps|neft|rtgs|txn|for|from|at|avl|bal|info|-)\b|[.,;:()]|\s{2,}|$)/i;
const BAD_NAME = /a\/c|acct|account|\bxx|\*{2,}|card|\bbank\b|your|^\d+$|^upi$/i;

const tidy = (raw) => {
  let s = String(raw || '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\b(upi|ref|refno|on)$/i, '').trim();
  if (s.length < 2 || BAD_NAME.test(s)) return '';
  // ALL CAPS, or all lower-case UPI handles → Title Case ("SWIGGY LTD" → "Swiggy Ltd")
  if (s === s.toUpperCase() || s === s.toLowerCase()) s = s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return s.slice(0, 40);
};

/** The other party: merchant you paid, or person/company that paid you. */
const counterpartyOf = (text, type) => {
  const vpa = text.match(/\b(?:to|from|by)\s*:?\s*(?:vpa\s*)?([a-z0-9._-]{2,}@[a-z][a-z0-9.]*)/i);
  if (vpa) {
    const handle = vpa[1].split('@')[0].replace(/[._-]+/g, ' ').replace(/\d{6,}/g, '').trim();
    const name = tidy(handle);
    if (name) return name;
  }
  const patterns = type === 'income'
    ? [
      // "for NEFT Cr-ACME TECHNOLOGIES PVT LTD." / "IMPS-CR-RAVI KUMAR"
      /\b(?:neft|imps|rtgs)[\s-]*(?:cr|credit)?[\s:-]+(?:[A-Z0-9]{8,}[\s-]+)?([A-Za-z][A-Za-z0-9&'. ]{2,40}?)(?=\s*[.,;(]|\s+(?:on|ref|avl|bal)\b|$)/i,
      new RegExp(`\\b(?:from|by)\\s+([A-Za-z][A-Za-z0-9&'. ]{1,40}?)${STOP.source}`, 'i'),
    ]
    : [
      new RegExp(`\\b(?:paid|sent|transferred)\\s+to\\s+([A-Za-z0-9][A-Za-z0-9&'. ]{1,40}?)${STOP.source}`, 'i'),
      new RegExp(`\\bat\\s+([A-Za-z0-9][A-Za-z0-9&'.* ]{1,40}?)${STOP.source}`, 'i'),
      new RegExp(`\\b(?:to|towards)\\s+([A-Za-z][A-Za-z0-9&'. ]{1,40}?)${STOP.source}`, 'i'),
      new RegExp(`\\bInfo:?\\s*([A-Za-z][A-Za-z0-9&'.* /-]{1,40}?)${STOP.source}`, 'i'),
    ];
  for (const rx of patterns) {
    const m = text.match(rx);
    const name = m && tidy(m[1]);
    if (name) return name;
  }
  return '';
};

/**
 * Parses one SMS. Returns null when it isn't a completed money movement,
 * otherwise { amount, type, date|null, merchant, description, category }.
 * `reason` is set on null results for diagnostics.
 */
const parseSms = (text, sender = '') => {
  const body = String(text || '').replace(/\s+/g, ' ').trim();
  if (!body) return { skip: 'empty' };
  if (sender && !isBankSender(sender) && !looksLikeBankText(body)) return { skip: 'not from a bank or payment app' };
  if (!sender && !looksLikeBankText(body)) return { skip: 'does not look like a bank message' };
  if (NOT_A_TRANSACTION.some((rx) => rx.test(body))) return { skip: 'not a completed transaction (OTP, request, reminder or offer)' };

  const amount = amountOf(body);
  if (!amount) return { skip: 'no amount found' };
  const type = directionOf(body);
  if (!type) return { skip: 'could not tell debit from credit' };

  const merchant = counterpartyOf(body, type);
  const description = merchant || (type === 'income' ? 'Money received' : 'Card / UPI payment');
  const category = suggestCategory(`${merchant} ${body}`) || (type === 'income' ? 'Other Income' : 'Other');
  return { amount, type, date: dateOf(body), merchant, description, category };
};

module.exports = { parseSms, isBankSender, senderCore, amountOf, directionOf, dateOf, counterpartyOf, balanceOf };

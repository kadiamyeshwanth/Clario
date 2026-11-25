/**
 * cron/recurringJob.js — materialises recurring templates into real transactions.
 *
 * Fixes over the original:
 *   • Catch-up: each template remembers its last generated occurrence, so days
 *     the server was asleep (free-tier hosts sleep) are generated on the next run
 *     instead of being skipped forever.
 *   • Month-end: a template dated the 31st fires on the last day of shorter
 *     months instead of never firing in them.
 *   • Goes through the ledger, so wallets, currency and flags are handled.
 */
const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const ledger = require('../services/ledger');
const logger = require('../lib/logger');

const MAX_CATCH_UP = 62; // never generate more than ~2 months of dailies in one go

const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** The occurrence after `prev` for a template anchored on `anchor` (all UTC dates at 00:00). */
const nextOccurrence = (prev, anchor, frequency) => {
  const d = new Date(prev);
  if (frequency === 'daily') { d.setUTCDate(d.getUTCDate() + 1); return d; }
  if (frequency === 'weekly') { d.setUTCDate(d.getUTCDate() + 7); return d; }
  const months = frequency === 'yearly' ? 12 : 1;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const ty = y + Math.floor(m / 12);
  const tm = ((m % 12) + 12) % 12;
  return new Date(Date.UTC(ty, tm, Math.min(anchor.getUTCDate(), daysIn(ty, tm))));
};

const utcDay = (date) => { const d = new Date(date); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };

/** All occurrences strictly after `lastRun` and on/before `today`. */
const dueOccurrences = (tmpl, today) => {
  const anchor = utcDay(tmpl.date);
  let cursor = tmpl.recurrenceLastRun ? utcDay(tmpl.recurrenceLastRun) : anchor;
  // Templates from the old build have no lastRun but the old job already posted
  // their past occurrences: fast-forward to yesterday so history isn't duplicated.
  if (!tmpl.recurrenceLastRun) {
    const yesterday = new Date(today.getTime() - 864e5);
    for (let i = 0; i < 5000; i++) {
      const next = nextOccurrence(cursor, anchor, tmpl.frequency);
      if (next > yesterday) break;
      cursor = next;
    }
  }
  const out = [];
  // The anchor itself was created as the first instance when the template was made.
  while (out.length < MAX_CATCH_UP) {
    const next = nextOccurrence(cursor, anchor, tmpl.frequency);
    if (next > today) break;
    out.push(next);
    cursor = next;
  }
  return out;
};

const runRecurringJob = async (now = new Date()) => {
  const today = utcDay(now);
  const templates = await Transaction.find({ isRecurring: true, frequency: { $ne: 'once' } });
  let created = 0;

  for (const tmpl of templates) {
    const due = dueOccurrences(tmpl, today);
    if (!due.length) continue;
    const user = await User.findById(tmpl.userId).select('username').lean();
    if (!user) continue;

    for (const date of due) {
      try {
        await ledger.createTransaction(
          { id: tmpl.userId, username: user.username },
          {
            type: tmpl.type, category: tmpl.category, date,
            amount: tmpl.originalAmount || tmpl.amount,
            currency: tmpl.originalCurrency || undefined,
            description: tmpl.description || tmpl.category,
            merchant: tmpl.merchant, tags: tmpl.tags, walletId: tmpl.walletId,
            // Deterministic key: re-running the job can never double-post.
            clientId: `rec-${tmpl._id}-${date.toISOString().slice(0, 10)}`,
          },
          { source: 'recurring_cron', notifyFlags: false }
        );
        created++;
      } catch (err) {
        logger.error('recurring: occurrence failed', { template: String(tmpl._id), err: err.message });
      }
    }
    tmpl.recurrenceLastRun = due[due.length - 1];
    await tmpl.save();
  }
  logger.info(`recurring: ${created} transaction(s) created from ${templates.length} template(s)`);
  return { created, templates: templates.length };
};

const startRecurringCron = () => {
  // Hourly, so a server that wakes mid-day still posts today's items promptly.
  cron.schedule('5 * * * *', () => runRecurringJob().catch((e) => logger.error('recurring job', { err: e.message })));
};

module.exports = { startRecurringCron, runRecurringJob, nextOccurrence, dueOccurrences };

const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const transactionSchema = new Schema({
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    username: { type: String, required: true },
    type:     { type: String, required: true, enum: ['income', 'expense'] },
    category: { type: String, required: true, trim: true },
    // Always in the user's base currency, so every aggregation stays a plain $sum.
    amount:   { type: Number, required: true, min: [0.01, 'Amount must be positive'] },
    date:     { type: Date, required: true },
    description: { type: String, trim: true },
    merchant:    { type: String, trim: true, default: '' },          // merchant/payee name
    tags:        [{ type: String, trim: true }],                     // user-defined labels
    flags:       [{ type: String }],                                 // system flags: 'late-night', 'impulse', 'duplicate', 'abnormal'
    isRecurring: { type: Boolean, default: false },
    frequency:   { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly', 'once'], default: 'once' },
    notes:       { type: String, trim: true, default: '', maxlength: 1000 },
    // Templates only: the last occurrence generated, so a missed day (server
    // asleep, deploy, outage) is caught up instead of silently skipped.
    recurrenceLastRun: { type: Date, default: null },

    // ── Account ───────────────────────────────────────────────────────────────
    // When set, creating/editing/deleting this row moves the wallet's balance.
    walletId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', default: null, index: true },
    // What this row moved the wallet by, in the wallet's own currency, so the
    // effect can be reversed exactly on edit/delete even if rates moved since.
    walletAmount:{ type: Number, default: null },

    // ── Foreign currency ──────────────────────────────────────────────────────
    // Spent abroad or paid in another currency: keep what the receipt said,
    // plus the rate used to turn it into `amount`.
    originalAmount:   { type: Number, default: null },
    originalCurrency: { type: String, default: null, uppercase: true, maxlength: 3 },
    fxRate:           { type: Number, default: null },

    // ── Provenance ────────────────────────────────────────────────────────────
    source:      { type: String, enum: ['manual', 'sms_webhook', 'csv_import', 'recurring_cron', 'receipt', 'split', 'mobile'], default: 'manual', index: true },
    smsSender:   { type: String, trim: true, default: '' },
    smsRaw:      { type: String, default: '' },
    // Idempotency key from offline-capable clients: a retried request with the
    // same key returns the original row instead of creating a duplicate.
    clientId:    { type: String, default: undefined, maxlength: 64 },
}, {
    timestamps: true,
});

// The dashboard, reports and Mira all read "this user's rows in a date range".
transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, isRecurring: 1, type: 1, date: -1 });
transactionSchema.index({ userId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;

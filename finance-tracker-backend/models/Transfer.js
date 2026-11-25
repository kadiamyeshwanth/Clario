/**
 * Transfer.js — money moved between two of the user's own wallets.
 *
 * Deliberately NOT a Transaction: moving savings into a credit card is neither
 * income nor spending, and counting it as either would distort every report.
 */
const mongoose = require('mongoose');

const transferSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  fromWalletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
  toWalletId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
  amount:       { type: Number, required: true, min: 0.01 },
  date:         { type: Date, required: true, default: Date.now },
  note:         { type: String, trim: true, default: '', maxlength: 200 },
}, { timestamps: true });

transferSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('Transfer', transferSchema);

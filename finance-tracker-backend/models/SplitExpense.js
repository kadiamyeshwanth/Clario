/**
 * SplitExpense.js — one shared cost, or one settle-up payment, inside a group.
 *
 * `shares` always sums to `amount` to the cent (enforced in services/splits.js),
 * so balances are a pure fold over this collection and never need storing.
 * A settlement has the same shape: payer = who paid back, one share = who received.
 */
const mongoose = require('mongoose');

const shareSchema = new mongoose.Schema({
  memberId: { type: mongoose.Schema.Types.ObjectId, required: true },
  amount:   { type: Number, required: true, min: 0 },
}, { _id: false });

const splitExpenseSchema = new mongoose.Schema({
  groupId:        { type: mongoose.Schema.Types.ObjectId, ref: 'SplitGroup', required: true, index: true },
  kind:           { type: String, enum: ['expense', 'settlement'], default: 'expense' },
  description:    { type: String, required: true, trim: true, maxlength: 120 },
  amount:         { type: Number, required: true, min: 0.01 },
  paidByMemberId: { type: mongoose.Schema.Types.ObjectId, required: true },
  splitMethod:    { type: String, enum: ['equal', 'exact', 'percent', 'shares'], default: 'equal' },
  shares:         { type: [shareSchema], required: true },
  category:       { type: String, trim: true, default: 'Other' },
  date:           { type: Date, required: true, default: Date.now },
  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

splitExpenseSchema.index({ groupId: 1, date: -1 });

module.exports = mongoose.model('SplitExpense', splitExpenseSchema);

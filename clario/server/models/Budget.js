const mongoose = require('mongoose');

/**
 * A spending limit for one category that applies to every calendar month.
 *
 * The original code compared the limit against ALL-TIME spending in the
 * category, so a budget went "over" forever after its first month. Spending is
 * now always measured within the current month; `rollover` carries last
 * month's unspent remainder forward.
 */
const budgetSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  category: { type: String, required: true, trim: true },
  limit:    { type: Number, required: true, min: [1, 'Limit must be at least 1'] },
  period:   { type: String, enum: ['monthly'], default: 'monthly' },
  rollover: { type: Boolean, default: false },
  alertAt:  { type: Number, min: 10, max: 100, default: 80 },   // % used that triggers the warning
  // Kept for compatibility with records written by the old client.
  month:    { type: String, required: false, default: 'current' },
}, { timestamps: true });

budgetSchema.index({ userId: 1, category: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);

/**
 * Challenge.js — a challenge the user has joined.
 *
 * Progress is never stored while active: it is recomputed from transactions on
 * read, so it cannot drift from what actually happened. What IS stored is the
 * commitment (kind, window, target) and the outcome once the window closes.
 */
const mongoose = require('mongoose');

const challengeSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind:      { type: String, required: true, enum: ['no_spend_days', 'category_cap', 'total_cap', 'savings_rate', 'daily_cap'] },
  title:     { type: String, required: true, trim: true, maxlength: 80 },
  category:  { type: String, trim: true, default: '' },     // for category_cap
  target:    { type: Number, required: true, min: 0 },       // days / amount / percent depending on kind
  startDate: { type: Date, required: true },
  endDate:   { type: Date, required: true },
  status:    { type: String, enum: ['active', 'completed', 'failed', 'abandoned'], default: 'active', index: true },
  finalProgress: { type: Number, default: null },
  completedAt:   { type: Date, default: null },
}, { timestamps: true });

challengeSchema.index({ userId: 1, status: 1, endDate: -1 });

module.exports = mongoose.model('Challenge', challengeSchema);

/**
 * SplitGroup.js — a group that shares costs (a trip, a flat, a dinner club).
 *
 * Members are either Clario users (userId set) or people who have not signed up
 * (name + optional email). The person who books the holiday flat should not have
 * to get five friends to install an app before splitting it. A guest member is
 * claimed later when that person joins with the invite code.
 */
const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name:   { type: String, required: true, trim: true, maxlength: 60 },
  email:  { type: String, trim: true, lowercase: true, default: '' },
}, { _id: true });

const splitGroupSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true, maxlength: 80 },
  currency:   { type: String, required: true, uppercase: true, default: 'INR' },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members:    { type: [memberSchema], validate: [(m) => m.length >= 1 && m.length <= 50, 'A group needs 1–50 members.'] },
  inviteCode: { type: String, required: true, unique: true },
  archived:   { type: Boolean, default: false },
}, { timestamps: true });

splitGroupSchema.index({ 'members.userId': 1 });

module.exports = mongoose.model('SplitGroup', splitGroupSchema);

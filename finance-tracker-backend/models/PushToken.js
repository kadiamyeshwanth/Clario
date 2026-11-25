/**
 * PushToken.js — an Expo push token for one of the user's phones.
 */
const mongoose = require('mongoose');

const pushTokenSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token:      { type: String, required: true, unique: true },
  platform:   { type: String, enum: ['ios', 'android', 'web'], default: 'android' },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('PushToken', pushTokenSchema);

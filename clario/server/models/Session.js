/**
 * Session.js — one row per signed-in device.
 *
 * Holds the SHA-256 of the current refresh token (never the token itself).
 * Refresh tokens rotate on every use; presenting an already-rotated token means
 * it was stolen and replayed, so the whole session is revoked.
 */
const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash:    { type: String, required: true, index: true },
  previousHash: { type: String, default: null, index: true },
  device:       { type: String, default: 'Unknown device', maxlength: 120 },
  platform:     { type: String, enum: ['web', 'ios', 'android', 'other'], default: 'web' },
  ip:           { type: String, default: '' },
  lastUsedAt:   { type: Date, default: Date.now },
  expiresAt:    { type: Date, required: true },
  revokedAt:    { type: Date, default: null },
}, { timestamps: true });

// Mongo drops expired sessions on its own.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', sessionSchema);

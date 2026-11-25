/**
 * OAuthCode.js — single-use, 60-second hand-off code for Google sign-in.
 *
 * The old flow put a 7-day JWT in the redirect URL, where it lands in browser
 * history, proxy logs and Referer headers. Now the redirect carries only this
 * code, which the client exchanges (once) for real tokens over a POST.
 */
const mongoose = require('mongoose');

const oauthCodeSchema = new mongoose.Schema({
  codeHash:  { type: String, required: true, unique: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  platform:  { type: String, default: 'web' },
  expiresAt: { type: Date, required: true },
});
oauthCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OAuthCode', oauthCodeSchema);

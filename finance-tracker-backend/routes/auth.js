/**
 * routes/auth.js — sign-up, sign-in, sessions, password reset, Google OAuth.
 *
 *   POST /register            create account → { user, accessToken, refreshToken }
 *   POST /login               username-or-email + password → same
 *   POST /refresh             rotate refresh token → new pair
 *   POST /logout              revoke this device's session
 *   POST /logout-all          revoke every session (JWT)
 *   GET  /sessions            list signed-in devices (JWT)
 *   DELETE /sessions/:id      sign one device out (JWT)
 *   GET  /me                  current user (JWT)
 *   POST /forgot-password     email a reset link (always same response)
 *   POST /reset-password      set a new password with the emailed token
 *   GET  /google[?platform=]  start Google OAuth
 *   GET  /google/callback     → redirect with a one-time code
 *   POST /oauth/exchange      one-time code → tokens
 */
const router = require('express').Router();
const crypto = require('crypto');
const env = require('../config/env');
const User = require('../models/User');
const Session = require('../models/Session');
const OAuthCode = require('../models/OAuthCode');
const passport = require('../config/passport');
const protect = require('../middleware/protect');
const { validate } = require('../middleware/validate');
const { registerSchema, loginSchema, resetPasswordSchema } = require('../schemas/validation');
const { issueSession, rotateSession, revokeByToken, revokeAll, sha256 } = require('../services/sessions');
const { sendResetEmail, isMailerConfigured } = require('../utils/mailer');
const { isSupported } = require('../utils/currencies');
const { HttpError, escapeRegex } = require('../lib/http');
const logger = require('../lib/logger');

const LANGS = ['en', 'hi', 'es', 'fr', 'de', 'pt'];
const validTz = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

const authResponse = async (user, req, message) => ({
  message,
  user: user.toPublic(),
  ...(await issueSession(user, req)),
});

// ── Register ────────────────────────────────────────────────────────────────
router.post('/register', validate(registerSchema), async (req, res) => {
  const { username, email, password, currency, timezone, language, locale } = req.body;
  const emailLc = email.toLowerCase().trim();

  const existing = await User.findOne({
    $or: [{ username: new RegExp(`^${escapeRegex(username)}$`, 'i') }, { email: emailLc }],
  }).lean();
  if (existing) {
    const field = existing.email === emailLc ? 'Email' : 'Username';
    throw new HttpError(409, `${field} is already taken.`);
  }

  const preferences = {};
  if (currency && isSupported(currency)) preferences.currency = currency.toUpperCase();
  if (timezone && validTz(timezone)) preferences.timezone = timezone;
  if (language && LANGS.includes(language)) preferences.language = language;
  if (locale && /^[a-z]{2,3}(-[A-Z]{2})?$/.test(locale)) preferences.locale = locale;

  const user = await User.create({ username, email: emailLc, password, preferences });
  res.status(201).json(await authResponse(user, req, 'Account created successfully!'));
});

// ── Login ───────────────────────────────────────────────────────────────────
router.post('/login', validate(loginSchema), async (req, res) => {
  const { username, password } = req.body;
  const id = username.trim();
  const user = await User.findOne({ $or: [{ username: id }, { email: id.toLowerCase() }] });

  // Same message for unknown user and wrong password: no account enumeration.
  if (!user) throw new HttpError(401, 'Invalid credentials.');
  if (user.isLocked()) {
    const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw new HttpError(429, `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or reset your password.`);
  }
  if (!user.password) throw new HttpError(401, 'This account uses Google sign-in. Continue with Google, or set a password via “Forgot password”.');

  const ok = await user.comparePassword(password);
  if (!ok) {
    await user.registerFailedLogin();
    throw new HttpError(401, 'Invalid credentials.');
  }
  await user.clearFailedLogins();
  res.json(await authResponse(user, req, 'Logged in successfully!'));
});

// ── Sessions ────────────────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const result = await rotateSession(req.body?.refreshToken, req, (id) => User.findById(id));
  res.json({ token: result.token, accessToken: result.accessToken, refreshToken: result.refreshToken, sessionId: result.sessionId, user: result.user.toPublic() });
});

router.post('/logout', async (req, res) => {
  await revokeByToken(req.body?.refreshToken);
  res.json({ message: 'Signed out.' });
});

router.post('/logout-all', protect, async (req, res) => {
  const { modifiedCount } = await revokeAll(req.user.id);
  res.json({ message: 'Signed out everywhere.', revoked: modifiedCount });
});

router.get('/sessions', protect, async (req, res) => {
  const current = req.get('x-session-id') || '';
  const sessions = await Session.find({ userId: req.user.id, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ lastUsedAt: -1 }).lean();
  res.json(sessions.map((s) => ({
    id: s._id, device: s.device, platform: s.platform, lastUsedAt: s.lastUsedAt, createdAt: s.createdAt,
    current: !!current && String(s._id) === current,
  })));
});

router.delete('/sessions/:id', protect, async (req, res) => {
  const r = await Session.updateOne({ _id: req.params.id, userId: req.user.id, revokedAt: null }, { revokedAt: new Date() });
  if (!r.matchedCount) throw new HttpError(404, 'Session not found.');
  res.json({ message: 'Device signed out.' });
});

// ── Me ──────────────────────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new HttpError(404, 'User not found.');
  res.json({ user: user.toPublic() });
});

// ── Password reset ──────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  const SAFE_MSG = 'If that email is registered, a reset link has been sent.';

  const user = await User.findOne({ email });
  if (!user) return res.json({ message: SAFE_MSG });

  if (!isMailerConfigured() && env.isProd) {
    logger.error('forgot-password: mailer not configured');
    throw new HttpError(503, 'Password reset is temporarily unavailable. Please contact support.');
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  user.resetToken = sha256(rawToken);
  user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;
  await sendResetEmail(user.email, resetUrl);
  res.json({ message: SAFE_MSG });
});

router.post('/reset-password', validate(resetPasswordSchema), async (req, res) => {
  const { token, email, password } = req.body;
  const user = await User.findOne({
    email: email.toLowerCase().trim(),
    resetToken: sha256(token),
    resetTokenExpiry: { $gt: new Date() },
  });
  if (!user) throw new HttpError(400, 'Invalid or expired reset link. Please request a new one.');

  user.password = password;
  user.resetToken = undefined;
  user.resetTokenExpiry = undefined;
  user.failedLogins = 0;
  user.lockUntil = null;
  await user.save();
  // A reset means the old password may be compromised: sign out every device.
  await revokeAll(user._id);
  res.json({ message: 'Password updated successfully. You can now log in.' });
});

// ── Google OAuth ────────────────────────────────────────────────────────────
const loginRedirect = (platform, query) =>
  platform === 'mobile' ? `${env.MOBILE_SCHEME}://auth/callback?${query}` : `${env.FRONTEND_URL}/login?${query}`;

router.get('/google', (req, res, next) => {
  const platform = req.query.platform === 'mobile' ? 'mobile' : 'web';
  if (!passport.isGoogleEnabled) return res.redirect(loginRedirect(platform, 'error=oauth_unavailable'));
  return passport.authenticate('google', { scope: ['profile', 'email'], session: false, state: platform })(req, res, next);
});

router.get('/google/callback',
  (req, res, next) => {
    const platform = req.query.state === 'mobile' ? 'mobile' : 'web';
    if (!passport.isGoogleEnabled) return res.redirect(loginRedirect(platform, 'error=oauth_unavailable'));
    return passport.authenticate('google', { session: false, failureRedirect: loginRedirect(platform, 'error=oauth') })(req, res, next);
  },
  async (req, res) => {
    const platform = req.query.state === 'mobile' ? 'mobile' : 'web';
    const code = crypto.randomBytes(32).toString('base64url');
    await OAuthCode.create({ codeHash: sha256(code), userId: req.user._id, platform, expiresAt: new Date(Date.now() + 60_000) });
    const target = platform === 'mobile' ? `${env.MOBILE_SCHEME}://auth/callback` : `${env.FRONTEND_URL}/auth/callback`;
    res.redirect(`${target}?code=${code}`);
  }
);

router.post('/oauth/exchange', async (req, res) => {
  const code = String(req.body?.code || '');
  if (!code) throw new HttpError(400, 'Code is required.');
  const entry = await OAuthCode.findOneAndDelete({ codeHash: sha256(code), expiresAt: { $gt: new Date() } });
  if (!entry) throw new HttpError(400, 'This sign-in link has expired. Please try again.');
  const user = await User.findById(entry.userId);
  if (!user) throw new HttpError(400, 'Account not found.');
  res.json(await authResponse(user, req, 'Signed in with Google.'));
});

module.exports = router;

/**
 * services/sessions.js — access + refresh token issuance with rotation.
 *
 *   access token  : JWT, 15 min, sent on every request.
 *   refresh token : 48 random bytes, 30 days, stored only as a SHA-256 hash.
 *
 * Each refresh rotates the token. If a token that was already rotated away is
 * presented again, someone is replaying a stolen copy: the session is revoked
 * and both the thief and the real device must sign in again.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const Session = require('../models/Session');
const { HttpError } = require('../lib/http');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newRefreshToken = () => crypto.randomBytes(48).toString('base64url');

const signAccessToken = (user) =>
  jwt.sign(
    { id: String(user._id), username: user.username, email: user.email, typ: 'access' },
    env.JWT_SECRET,
    { expiresIn: env.ACCESS_TOKEN_TTL, algorithm: 'HS256' }
  );

const describeDevice = (req) => {
  const ua = String(req.get('user-agent') || '');
  const explicit = String(req.get('x-client-device') || '').slice(0, 120);
  if (explicit) return explicit;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return [browser, os && `on ${os}`].filter(Boolean).join(' ') || 'Unknown device';
};

const platformOf = (req) => {
  const p = String(req.get('x-client-platform') || '').toLowerCase();
  return ['web', 'ios', 'android'].includes(p) ? p : 'web';
};

/** Creates a session for a freshly authenticated user and returns both tokens. */
const issueSession = async (user, req) => {
  const refreshToken = newRefreshToken();
  const session = await Session.create({
    userId: user._id,
    tokenHash: sha256(refreshToken),
    device: describeDevice(req),
    platform: platformOf(req),
    ip: req.ip || '',
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 864e5),
  });
  const accessToken = signAccessToken(user);
  return {
    token: accessToken,          // name kept for old clients
    accessToken,
    refreshToken,
    sessionId: session._id,
  };
};

/** Exchanges a refresh token for a new pair. Detects replay of rotated tokens. */
const rotateSession = async (refreshToken, req, loadUser) => {
  if (!refreshToken || typeof refreshToken !== 'string') throw new HttpError(401, 'Refresh token required.');
  const hash = sha256(refreshToken);

  const session = await Session.findOne({ tokenHash: hash });
  if (!session) {
    const replayed = await Session.findOne({ previousHash: hash, revokedAt: null });
    if (replayed) {
      replayed.revokedAt = new Date();
      await replayed.save();
    }
    throw new HttpError(401, 'Session is no longer valid. Please sign in again.');
  }
  if (session.revokedAt || session.expiresAt < new Date()) {
    throw new HttpError(401, 'Session expired. Please sign in again.');
  }

  const user = await loadUser(session.userId);
  if (!user) throw new HttpError(401, 'Account no longer exists.');

  const next = newRefreshToken();
  session.previousHash = hash;
  session.tokenHash = sha256(next);
  session.lastUsedAt = new Date();
  session.ip = req.ip || session.ip;
  session.expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 864e5);
  await session.save();

  const accessToken = signAccessToken(user);
  return { token: accessToken, accessToken, refreshToken: next, sessionId: session._id, user };
};

const revokeByToken = async (refreshToken) => {
  if (!refreshToken) return;
  await Session.updateOne({ tokenHash: sha256(refreshToken) }, { revokedAt: new Date() });
};

const revokeAll = (userId, exceptSessionId) =>
  Session.updateMany(
    { userId, revokedAt: null, ...(exceptSessionId && { _id: { $ne: exceptSessionId } }) },
    { revokedAt: new Date() }
  );

module.exports = { issueSession, rotateSession, revokeByToken, revokeAll, signAccessToken, sha256 };

const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Verifies the short-lived access token sent as `Authorization: Bearer <token>`.
 *
 * On success: `req.user = { id, username, email }` and next().
 * On failure: 401. An expired token returns `code: 'token_expired'` so clients
 * know to use their refresh token instead of logging the user out.
 */
const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.', code: 'no_token' });
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), env.JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.typ && decoded.typ !== 'access') throw new Error('wrong token type');
    req.user = { id: decoded.id, username: decoded.username, email: decoded.email };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired.', code: 'token_expired' });
    }
    return res.status(401).json({ error: 'Invalid token.', code: 'invalid_token' });
  }
};

module.exports = protect;

/**
 * lib/http.js — shared HTTP helpers for routes.
 *
 *  • HttpError     — throw from a handler to send a status + message.
 *  • asyncHandler  — wraps an async handler so rejections reach the error middleware
 *                    (Express 5 already does this, but being explicit keeps intent clear).
 *  • escapeRegex   — user text must never be used as a raw regular expression.
 *  • pick          — whitelist fields from a request body (no mass assignment).
 */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const pick = (obj = {}, keys = []) => {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
};

const isObjectId = (v) => /^[a-f\d]{24}$/i.test(String(v || ''));

module.exports = { HttpError, asyncHandler, escapeRegex, pick, isObjectId };

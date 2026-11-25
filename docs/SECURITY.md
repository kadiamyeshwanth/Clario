# Security model

## Sessions
- **Access token**: HS256 JWT, 15 minutes, sent as `Authorization: Bearer`. Carries a `typ: access` claim; algorithm pinned on verify.
- **Refresh token**: 48 random bytes, 30 days, stored server-side only as SHA-256 (`Session` collection, TTL-expired). Rotated on every use. Re-presenting a rotated token is treated as theft: the whole session is revoked.
- Web keeps tokens in `localStorage`; mobile keeps them in the iOS Keychain / Android Keystore (`expo-secure-store`).
- Password change and password reset sign out other devices. Users can list and revoke devices.
- Google sign-in redirects with a single-use, 60-second code (hashed at rest), never a token in the URL.

## CSRF / XSS
Auth is a bearer header, never a cookie, so cross-site requests arrive unauthenticated — no CSRF surface. If auth ever moves to cookies, add CSRF protection in the same change. The live risk is XSS (it could read the token): user text is never rendered as HTML without escaping (see `escapeHtml` in the AI page).

## Input handling
- Zod schemas on every write route; update schemas whitelist fields (no mass assignment of `userId`/`_id`).
- `$`-prefixed and dotted keys are stripped from all JSON bodies.
- Search text is regex-escaped. Sort fields are whitelisted. `limit=0` is capped.
- CSV export neutralises spreadsheet formulas (`=`, `+`, `-`, `@`).

## Abuse
- Rate limits: auth 60 / 15 min / IP, API 300 / min / IP, SMS webhook 30 / min / token.
- Account lockout: 8 consecutive wrong passwords → 15-minute lock (same generic error otherwise; no account enumeration).
- Forgot-password always returns the same message.

## Data
- Every query is scoped by `userId`; split groups by membership. Integration tests assert cross-user isolation.
- Account deletion removes every owned collection, sessions and push tokens; shared split history keeps the person as a named guest so others' balances still add up.
- Export: full JSON and CSV.

## Known limits
- Email addresses are not verified at sign-up, so the "claim your seat by email" step in split groups also requires the invite code.
- The SMS webhook token is a bearer secret in a URL (as before); users can rotate it in Settings.

# Clario v3 — web, Android & iOS

The upgraded version of Personal Finance Tracker. The original code is
untouched next to this folder (`../finance-tracker`, `../finance-tracker-backend`,
`../sms-tracker-android`); everything here is a superset of it.

```
clario/
├── server/                 Node 22 · Express 5 · MongoDB (Mongoose 8) — the API
├── web/                    React 19 · Vite 7 — the existing Clario design, extended
├── mobile/                 Expo SDK 58 · React Native 0.88 · Expo Router — Android + iOS
├── android-sms-forwarder/  Kotlin SMS → webhook companion (unchanged, still compatible)
├── docker-compose.yml      Mongo + API + web on one machine
├── render.yaml             Render blueprint (API + static web)
└── docs/SECURITY.md
```

One API serves both apps. Everything a user sets (currency, language, timezone,
notification switches) is stored on the server, so web and phone always agree.

---

## What's new in v3

| Area | What it does |
|---|---|
| **Accounts that move** | Transactions can belong to an account; its balance updates on create/edit/delete (atomic `$inc`). Transfers between accounts don't count as income or spending. |
| **Any currency** | 22 currencies. Each user has a base currency; an expense paid in another currency keeps its original amount and is converted at a live daily rate (cached; offline fallback table). Accounts can each have their own currency. Changing base currency can convert your history. |
| **Split expenses** | Groups for trips, flats, dinners. Equal / exact / percentage / shares splits, cent-exact rounding, balances, "fewest payments" settle-up, invite codes, guests who don't have the app yet and can claim their seat later. Optionally adds your share to your own expenses. |
| **Challenges that count** | Join a challenge and the server tracks it over its own window, warns when you're at risk, and records pass/fail with a notification. Caps are personal (80% of your usual spend), not fixed rupee amounts. |
| **Monthly budgets, fixed** | Budgets are now measured against *this month* (they used all-time spend, so they read "over" forever after month one). Optional rollover and custom alert threshold. |
| **Notifications that reach you** | Budget warnings, bill reminders 3 days before renewal, challenge results, weekly digest, split updates — in-app and as phone push (Expo). Deduplicated; each type can be switched off. |
| **SMS auto-import (built into the app)** | Pay with GPay, PhonePe, Paytm, a card or at an ATM and the bank's SMS becomes a transaction automatically — amount, merchant, category, exact time. On Android the Clario app listens itself (works with the app closed, queues offline, can import the last 30 days). On iPhone, where Apple blocks SMS access for every app, a one-time Shortcuts automation forwards bank messages. Parser handles modern DLT sender IDs (`JX-SBIUPI`, `VM-HDFCBK-S`…), ignores OTPs, collect requests, mandate reminders, bill-due notices, failed payments and offers, and never reads the available balance as the amount. A payment texted by both the bank and the UPI app is recorded once. |
| **Mobile app** | Home, Transactions (search + infinite scroll), Ask Mira, Plan (budgets + goals), Accounts & transfers, Split, Challenges, Subscriptions, Notifications, Settings. Works offline for new entries (queued with an idempotency key, synced later). |
| **Languages** | English, हिन्दी, Español, Français, Deutsch, Português for navigation and the new screens (falls back to English elsewhere). |
| **Your data** | Full JSON export, CSV export (formula-injection safe), "sign out everywhere", per-device sign-out, account deletion that really removes every collection. |
| **One-call dashboard** | `GET /api/v1/meta/overview` returns a month's totals, categories, daily series, budgets, bills, net worth and a health score. |

### Fixes to existing features
Streaks could never exceed 1 day · recurring transactions dated the 31st never fired in short months, and days the server slept were skipped forever (now caught up, idempotently) · CSV import only de-duplicated against the last 30 days · SMS dedupe dropped genuine repeat payments and every SMS row was stamped 00:00 · transaction search used raw user input as a regex · wallet/subscription/investment/category PATCH accepted any field including `userId` · editing a goal without `currentAmount` saved `NaN` · account deletion left wallets, subscriptions, investments etc. behind · Mira, roast and advice texts were hard-coded to ₹ and Indian instruments.

---

## Run it locally

Prerequisites: Node 22+, MongoDB 7/8 running locally (or a MongoDB Atlas URI).

```bash
# 1. API
cd clario/server
cp .env.example .env          # set MONGODB_URI and JWT_SECRET
npm install
npm run dev                   # http://localhost:5000/api/v1/health

# 2. Web
cd ../web
npm install
npm run dev                   # http://localhost:5173  (VITE_API_URL defaults to localhost:5000/api)

# 3. Mobile
cd ../mobile
npm install
npx expo start                # press w for web, a for Android, i for iOS
```

Mobile API address: `EXPO_PUBLIC_API_URL` (or `extra.apiUrl` in `app.json`).
The Android emulator reaches your computer at `http://10.0.2.2:5000/api/v1`;
a physical phone needs your computer's LAN IP.

Or everything in Docker:

```bash
cd clario
echo "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")" > .env
docker compose up --build     # web :8080, api :5000
```

## Tests

```bash
cd clario/server && npm test     # API integration tests on a throwaway MongoDB + unit tests + Mira/categorizer suites
cd clario/web && npm run build
cd clario/mobile && npx expo-doctor && npx expo export --platform android --platform ios
```

The API tests use `mongodb-memory-server` (downloads MongoDB once; on Windows an
installed `mongod` is reused automatically). CI runs all three: `.github/workflows/clario.yml`.

## Deploy

| Piece | Where | Notes |
|---|---|---|
| API | Render / Railway / Fly / any Docker host | `clario/render.yaml` or `server/Dockerfile`. Long-running host recommended: the scheduled jobs (recurring, streaks, alerts) run in-process. Set `RUN_CRON=false` on all but one instance. Vercel (`server/api/index.js`) still works for the API, but cron jobs won't run there. |
| Database | MongoDB Atlas | Any tier. Indexes are created on boot. |
| Web | Vercel / Render static / nginx | `VITE_API_URL=https://<api-host>/api`. `web/Dockerfile` ships an nginx config with SPA fallback and caching. |
| Android & iOS | EAS Build | `npm i -g eas-cli && eas init` (sets `extra.eas.projectId`, needed for push) → fill the API URL in `eas.json` → `eas build -p android --profile production` / `-p ios` → `eas submit`. |
| SMS auto-import | Android build of the app | Needs a real build (`eas build -p android` or `npx expo run:android`); Expo Go can't load the native SMS module. `BACKEND_URL` must be the API's public https address so phones can reach the webhook. Google Play requires the SMS-permission declaration form for a money-management app before release. |
| Google sign-in | Google Cloud console | Redirect URI `https://<api-host>/api/auth/google/callback`. Mobile returns to `clario://auth/callback`. |
| Email | Brevo (HTTPS API) or SMTP | Needed for password reset in production. |

Required API env: `MONGODB_URI`, `JWT_SECRET` (32+ chars in production), `FRONTEND_URL`, `BACKEND_URL`. See `server/.env.example` for the rest.

## API

All routes are under `/api/v1` (also `/api` for the existing web build). New and changed:

```
POST /auth/register | /login            → { user, accessToken, refreshToken, sessionId }
POST /auth/refresh                        rotate refresh token (replay → session revoked)
POST /auth/logout | /logout-all           GET /auth/sessions · DELETE /auth/sessions/:id
POST /auth/oauth/exchange                 one-time Google code → tokens

GET|POST /transactions  PATCH|DELETE /transactions/:id   (walletId, currency, clientId)
GET /transactions/export.csv              POST /transactions/bulk-delete
GET|POST /wallets  PATCH|DELETE /wallets/:id  POST /wallets/transfer  GET /wallets/transfers
GET /budgets (with month status)  GET /budgets/status?offset=-1  PATCH /budgets/:id
GET /challenges  GET /challenges/catalogue  POST /challenges/join  POST /challenges/:id/abandon
GET|POST /splits/groups  POST /splits/groups/join  GET|PATCH /splits/groups/:id
POST /splits/groups/:id/{members,expenses,settle,leave}
GET|PATCH /users/preferences  GET /users/export  POST|DELETE /users/push-token
GET /meta/overview?month=YYYY-MM  GET /meta/currencies  GET /meta/fx?from=&to=&amount=
```

## Design rule

The Clario visual design is unchanged. New web screens (Split, Settings →
Preferences / Devices, the challenge commitments strip, transfers, the account &
currency fields) are built only from existing classes (`n-card`, `pg-form`,
`n-btn`, `n-input`, `a11y-row`, `a11y-seg`, `PageHeader`). The phone app copies the
same tokens: orange `#E85002`, `#0E0E0E`/`#1C1C1C` surfaces, Nunito / Unbounded /
Geist Mono, pill buttons, ~16–22px radii, colour only on money.

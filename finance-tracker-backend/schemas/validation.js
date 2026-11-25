/**
 * Zod validation schemas for all API routes.
 * Import and use with the validate() middleware.
 */
const { z } = require('zod');
const { SUPPORTED_CURRENCIES } = require('../utils/currencies');

// ── Auth ─────────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  username: z
    .string({ required_error: 'Username is required.' })
    .min(3, 'Username must be at least 3 characters.')
    .max(20, 'Username must be 20 characters or less.')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores.'),
  email: z
    .string({ required_error: 'Email is required.' })
    .email('Please enter a valid email address.'),
  password: z
    .string({ required_error: 'Password is required.' })
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password is too long.'),
  // Optional first-run preferences (detected by the client from the browser/phone).
  currency: z.string().length(3).optional(),
  timezone: z.string().max(60).optional(),
  language: z.string().max(5).optional(),
  locale:   z.string().max(20).optional(),
});

const resetPasswordSchema = z.object({
  token:    z.string().min(32).max(200),
  email:    z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128, 'Password is too long.'),
});

const loginSchema = z.object({
  username: z.string({ required_error: 'Username or email is required.' }).min(1),
  password: z.string({ required_error: 'Password is required.' }).min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters.')
    .max(128, 'Password is too long.'),
});

const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters.')
    .max(20, 'Username must be 20 characters or less.')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores.')
    .optional(),
  displayName: z.string().max(60, 'Name must be 60 characters or less.').optional(),
});

// ── Shared primitives ────────────────────────────────────────────────────────

/**
 * A date the API accepts from the client.
 * The forms send `YYYY-MM-DD` (native <input type="date">), but round-tripped
 * records — e.g. editing a goal fetched from Mongo — carry a full ISO datetime.
 * Both are valid; anything else is rejected before it reaches Date.parse().
 */
const dateString = (label = 'Date') =>
  z.string()
    .refine(
      (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || !isNaN(Date.parse(v)),
      `${label} must be a valid date (YYYY-MM-DD).`
    );

/** Accepts a real number or a numeric string ("1500", "1,500") and coerces it. */
const amountNumber = (label = 'Amount', max = 10_000_000) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? Number(v.replace(/[₹,\s]/g, '')) : v),
    z.number({ invalid_type_error: `${label} must be a number.` })
      .positive(`${label} must be greater than 0.`)
      .max(max, `${label} is too large.`)
  );

const toNumber = (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/[,\s]/g, '')) : v);
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id.');
const currencyCode = z.string().transform((v) => v.toUpperCase())
  .refine((v) => SUPPORTED_CURRENCIES.includes(v), 'Unsupported currency.');
// Hex, or one of the design system's colour tokens (the swatch pickers store `var(--brand)`).
const hexColor = z.string().regex(/^(#[0-9a-f]{6}|var\(--[a-z0-9-]{1,30}\))$/i, 'Colour must be a hex value like #E85002.');
const validTimeZone = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

// ── Transactions ─────────────────────────────────────────────────────────────

const transactionSchema = z.object({
  type:        z.enum(['income', 'expense'], { required_error: 'Type must be income or expense.' }),
  category:    z.string({ required_error: 'Category is required.' }).min(1, 'Category is required.').max(50),
  amount:      amountNumber('Amount'),
  date:        dateString('Date'),
  description: z.string().max(200, 'Description must be 200 characters or less.').optional(),
  // `merchant` and `tags` are real, user-facing fields — they must be declared
  // here or Zod strips them out of req.body before the route ever sees them.
  merchant:    z.string().max(100, 'Merchant must be 100 characters or less.').optional().default(''),
  tags:        z.preprocess(
                 (v) => (typeof v === 'string'
                   ? v.split(',').map(t => t.trim()).filter(Boolean)
                   : v),
                 z.array(z.string().max(30, 'Each tag must be 30 characters or less.'))
                   .max(10, 'Up to 10 tags per transaction.')
               ).optional().default([]),
  isRecurring: z.boolean().optional().default(false),
  // 'yearly' exists on the Mongoose model and in the frequency dropdown — the
  // old enum omitted it, which would have 400'd every yearly recurring entry.
  frequency:   z.enum(['daily', 'weekly', 'monthly', 'yearly', 'once']).optional().default('once'),
  notes:       z.string().max(1000, 'Notes must be 1000 characters or less.').optional(),
  walletId:    objectId.nullable().optional(),
  // ISO 4217 code of `amount`. Omitted = the user's base currency.
  currency:    currencyCode.optional(),
  // Idempotency key from offline-capable clients (mobile).
  clientId:    z.string().min(8).max(64).regex(/^[\w-]+$/).optional(),
  // Sent by the client but always overridden server-side from the JWT.
  username:    z.string().optional(),
});

/**
 * Edits are partial: only the fields sent are changed. Built field-by-field
 * because Zod 4 applies `.default()` even inside `.partial()`, which would
 * silently reset tags/recurrence on every edit.
 */
const transactionUpdateSchema = z.object({
  type:        z.enum(['income', 'expense']).optional(),
  category:    z.string().min(1).max(50).optional(),
  amount:      amountNumber('Amount').optional(),
  date:        dateString('Date').optional(),
  description: z.string().max(200).optional(),
  merchant:    z.string().max(100).optional(),
  tags:        z.preprocess(
                 (v) => (typeof v === 'string' ? v.split(',').map(t => t.trim()).filter(Boolean) : v),
                 z.array(z.string().max(30)).max(10)
               ).optional(),
  isRecurring: z.boolean().optional(),
  frequency:   z.enum(['daily', 'weekly', 'monthly', 'yearly', 'once']).optional(),
  notes:       z.string().max(1000).optional(),
  walletId:    objectId.nullable().optional(),
  currency:    currencyCode.optional(),
  username:    z.string().optional(),
});

// ── Wallets ──────────────────────────────────────────────────────────────────

const walletSchema = z.object({
  name:      z.string().trim().min(1, 'Wallet name is required.').max(60),
  type:      z.enum(['cash', 'bank', 'savings', 'credit', 'investment']).optional().default('bank'),
  balance:   z.preprocess(toNumber, z.number().min(-1e10).max(1e10)).optional().default(0),
  currency:  currencyCode.optional(),
  color:     hexColor.optional(),
  isDefault: z.boolean().optional().default(false),
  notes:     z.string().max(300).optional().default(''),
});
const walletUpdateSchema = z.object({
  name:      z.string().trim().min(1).max(60).optional(),
  type:      z.enum(['cash', 'bank', 'savings', 'credit', 'investment']).optional(),
  balance:   z.preprocess(toNumber, z.number().min(-1e10).max(1e10)).optional(),
  currency:  currencyCode.optional(),
  color:     hexColor.optional(),
  isDefault: z.boolean().optional(),
  notes:     z.string().max(300).optional(),
});

const transferSchema = z.object({
  fromWalletId: objectId,
  toWalletId:   objectId,
  amount:       amountNumber('Amount', 1e10),
  date:         dateString('Date').optional(),
  note:         z.string().max(200).optional().default(''),
}).refine((v) => v.fromWalletId !== v.toWalletId, { message: 'Choose two different accounts.', path: ['toWalletId'] });

// ── Preferences ──────────────────────────────────────────────────────────────

const preferencesSchema = z.object({
  currency:     currencyCode.optional(),
  language:     z.enum(['en', 'hi', 'es', 'fr', 'de', 'pt']).optional(),
  locale:       z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'Locale must look like en-US.').optional(),
  timezone:     z.string().max(60).refine(validTimeZone, 'Unknown timezone.').optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  notifications: z.object({
    budgetAlerts:  z.boolean().optional(),
    billReminders: z.boolean().optional(),
    weeklyDigest:  z.boolean().optional(),
    push:          z.boolean().optional(),
  }).optional(),
  // When the base currency changes: convert existing amounts (true) or relabel only.
  convertExisting: z.boolean().optional(),
});

// ── Challenges ───────────────────────────────────────────────────────────────

const challengeJoinSchema = z.object({
  key:      z.string().max(40),
  title:    z.string().trim().min(1).max(80).optional(),
  target:   z.preprocess(toNumber, z.number().positive().max(1e9)).optional(),
  category: z.string().max(50).optional(),
  days:     z.number().int().min(1).max(366).optional(),
});

// ── Split expenses ───────────────────────────────────────────────────────────

const splitGroupSchema = z.object({
  name:     z.string().trim().min(1, 'Group name is required.').max(80),
  currency: currencyCode.optional(),
  members:  z.array(z.object({
    name:  z.string().trim().min(1, 'Every member needs a name.').max(60),
    email: z.string().email().optional().or(z.literal('')),
  })).max(49).optional().default([]),
});

const splitMemberSchema = z.object({
  name:  z.string().trim().min(1, 'Name is required.').max(60),
  email: z.string().email().optional().or(z.literal('')),
});

const splitExpenseSchema = z.object({
  description:    z.string().trim().min(1, 'Description is required.').max(120),
  amount:         amountNumber('Amount', 1e9),
  paidByMemberId: objectId,
  splitMethod:    z.enum(['equal', 'exact', 'percent', 'shares']).default('equal'),
  participants:   z.array(z.union([objectId, z.object({ memberId: objectId, value: z.preprocess(toNumber, z.number().min(0)) })])).min(1, 'Choose at least one person.'),
  category:       z.string().max(50).optional().default('Other'),
  date:           dateString('Date').optional(),
  // Also record my share as a personal expense in my transactions.
  addToMyExpenses: z.boolean().optional().default(false),
});

const settlementSchema = z.object({
  fromMemberId: objectId,
  toMemberId:   objectId,
  amount:       amountNumber('Amount', 1e9),
  date:         dateString('Date').optional(),
}).refine((v) => v.fromMemberId !== v.toMemberId, { message: 'Pick two different people.', path: ['toMemberId'] });

// ── Goals ────────────────────────────────────────────────────────────────────

const goalSchema = z.object({
  name:          z.string({ required_error: 'Goal name is required.' }).min(1, 'Goal name is required.').max(100),
  targetAmount:  amountNumber('Target amount'),
  currentAmount: z.preprocess(
                   (v) => (typeof v === 'string' ? Number(v.replace(/[₹,\s]/g, '')) : v),
                   z.number({ invalid_type_error: 'Current amount must be a number.' })
                     .min(0, 'Current amount cannot be negative.')
                     .max(10_000_000, 'Current amount is too large.')
                 ).optional().default(0),
  deadline:      dateString('Deadline').optional(),
  username:      z.string().optional(),
});

/** Updates are partial — the route falls back to the stored value per field. */
const goalUpdateSchema = goalSchema.partial();

const contributeGoalSchema = z.object({
  amount: amountNumber('Contribution'),
});

// ── Budgets ──────────────────────────────────────────────────────────────────

const budgetSchema = z.object({
  category: z.string({ required_error: 'Category is required.' }).min(1, 'Category is required.').max(50),
  limit:    amountNumber('Limit'),
  month:    z.string().max(20).optional(),
  rollover: z.boolean().optional(),
  alertAt:  z.preprocess(toNumber, z.number().min(10).max(100)).optional(),
  username: z.string().optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  updateProfileSchema,
  resetPasswordSchema,
  transactionSchema,
  transactionUpdateSchema,
  goalSchema,
  goalUpdateSchema,
  contributeGoalSchema,
  budgetSchema,
  walletSchema,
  walletUpdateSchema,
  transferSchema,
  preferencesSchema,
  challengeJoinSchema,
  splitGroupSchema,
  splitMemberSchema,
  splitExpenseSchema,
  settlementSchema,
};

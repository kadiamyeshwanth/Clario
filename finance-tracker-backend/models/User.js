const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { SUPPORTED_CURRENCIES } = require('../utils/currencies');

const Schema = mongoose.Schema;

const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;

const userSchema = new Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
  },
  displayName: { type: String, trim: true, maxlength: 60, default: '' },
  password: {
    type: String,
    // Not required for OAuth users who sign in via Google
    minlength: [8, 'Password must be at least 8 characters'],
  },
  // Password-reset fields (only populated during reset flow)
  resetToken:       { type: String,  default: undefined },
  resetTokenExpiry: { type: Date,    default: undefined },
  // Google OAuth
  googleId: { type: String, sparse: true },
  // SMS Webhook Token — unique per-user token for SMS forwarder app authentication
  smsWebhookToken: { type: String, default: undefined, index: true },

  // ── Preferences (internationalisation) ────────────────────────────────────
  // `currency` is the user's base currency: every stored `amount` is in it.
  // Entries made in another currency keep their original figure alongside.
  preferences: {
    currency: { type: String, enum: SUPPORTED_CURRENCIES, default: 'INR' },
    language: { type: String, enum: ['en', 'hi', 'es', 'fr', 'de', 'pt'], default: 'en' },
    locale:   { type: String, default: 'en-IN', maxlength: 20 },
    timezone: { type: String, default: 'Asia/Kolkata', maxlength: 60 },
    weekStartsOn: { type: Number, min: 0, max: 6, default: 1 },
    notifications: {
      budgetAlerts:   { type: Boolean, default: true },
      billReminders:  { type: Boolean, default: true },
      weeklyDigest:   { type: Boolean, default: true },
      push:           { type: Boolean, default: true },
    },
  },
  onboardedAt: { type: Date, default: null },

  // ── Brute-force protection ────────────────────────────────────────────────
  failedLogins: { type: Number, default: 0 },
  lockUntil:    { type: Date, default: null },
}, { timestamps: true });

userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (plainPassword) {
  if (!this.password) return false; // OAuth-only account
  return bcrypt.compare(plainPassword, this.password);
};

userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > new Date());
};

/** Records a failed login; locks the account after too many in a row. */
userSchema.methods.registerFailedLogin = async function () {
  this.failedLogins = (this.failedLogins || 0) + 1;
  if (this.failedLogins >= MAX_FAILED_LOGINS) {
    this.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    this.failedLogins = 0;
  }
  await this.save({ validateBeforeSave: false });
};

userSchema.methods.clearFailedLogins = async function () {
  if (this.failedLogins || this.lockUntil) {
    this.failedLogins = 0;
    this.lockUntil = null;
    await this.save({ validateBeforeSave: false });
  }
};

/** The shape every auth response returns — never the hash or tokens. */
userSchema.methods.toPublic = function () {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    displayName: this.displayName || '',
    hasPassword: !!this.password,
    preferences: this.preferences?.toObject ? this.preferences.toObject() : this.preferences,
    onboarded: !!this.onboardedAt,
    createdAt: this.createdAt,
  };
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetToken;
  delete obj.resetTokenExpiry;
  delete obj.smsWebhookToken;
  delete obj.failedLogins;
  delete obj.lockUntil;
  return obj;
};

const User = mongoose.model('User', userSchema);
module.exports = User;
module.exports.LOCK_MINUTES = LOCK_MINUTES;

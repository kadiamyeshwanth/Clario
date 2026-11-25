const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title:   { type: String, required: true },
  body:    { type: String, required: true },
  type:    { type: String, enum: ['info', 'warning', 'danger', 'success'], default: 'info' },
  isRead:  { type: Boolean, default: false },
  link:    { type: String, default: '' },     // optional route to navigate to on click
  icon:    { type: String, default: '' },     // icon key; the client maps `type` to its icon set
  kind:    { type: String, default: 'general' },
  dedupeKey: { type: String, default: undefined },
}, { timestamps: true });

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, dedupeKey: 1, createdAt: -1 }, { partialFilterExpression: { dedupeKey: { $type: 'string' } } });
// Keep the inbox bounded: notifications older than 180 days are dropped.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 86400 });

module.exports = mongoose.model('Notification', notificationSchema);

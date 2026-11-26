const mongoose = require('mongoose');

/**
 * Logs personalized (single-user) and bulk emails sent by the admin
 * so they can be surfaced as in-app notifications and audited in admin logs.
 * Automated/system emails (OTP, cron reminders, etc.) are intentionally excluded.
 */
const adminMessageLogSchema = new mongoose.Schema({
  batchId: {
    type: String,
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['personal', 'bulk'],
    required: true,
    index: true,
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  recipientEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  recipientName: {
    type: String,
    default: '',
  },
  subject: {
    type: String,
    required: true,
  },
  bodyHtml: {
    type: String,
    required: true,
  },
  bodyText: {
    type: String,
    default: '',
  },
  mode: {
    type: String,
    enum: ['text', 'html'],
    default: 'text',
  },
  deliveryStatus: {
    type: String,
    enum: ['sent', 'failed'],
    default: 'sent',
  },
  error: {
    type: String,
    default: null,
  },
  readInApp: {
    type: Boolean,
    default: false,
    index: true,
  },
  readInAppAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

adminMessageLogSchema.index({ recipientId: 1, createdAt: -1 });
adminMessageLogSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('AdminMessageLog', adminMessageLogSchema);

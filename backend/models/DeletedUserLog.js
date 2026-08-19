const mongoose = require('mongoose');

const DeletedUserLogSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    default: ''
  },
  username: {
    type: String,
    required: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    index: true
  },
  deletionReason: {
    type: String,
    default: ''
  },
  accountCreatedAt: {
    type: Date
  },
  deletedAt: {
    type: Date,
    default: Date.now
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  highestStreak: {
    type: Number,
    default: 0
  },
  isPremium: {
    type: Boolean,
    default: false
  },
  ipAddress: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('DeletedUserLog', DeletedUserLogSchema);

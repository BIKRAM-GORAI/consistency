const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      minlength: 4,
      maxlength: 20,
      match: [/^[!-~]+$/, 'Username can only contain alphanumeric and special characters (no spaces)'],
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    // Plain text password — simple personal project, no encryption needed
    password: {
      type: String,
      required: true,
    },
    // Privacy toggle: when false, other group members cannot see this user's achievements
    achievementsPublic: {
      type: Boolean,
      default: true,
    },
    currentStreak: {
      type: Number,
      default: 0,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
    emailNotifications: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);

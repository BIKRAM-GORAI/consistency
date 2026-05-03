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
    profilePicture: {
      type: String,
      default: '',
    },
    profilePictureId: {
      type: String,
      default: '',
    },
    password: {
      type: String,
      required: function() {
        // Password is required only if the user has no OAuth providers
        return !this.authProviders || this.authProviders.length === 0;
      },
    },
    // Array to track OAuth providers (e.g., google, github, facebook)
    authProviders: [{
      provider: String,
      uid: String
    }],
    // Privacy toggle: when false, other group members cannot see this user's achievements
    achievementsPublic: {
      type: Boolean,
      default: true,
    },
    isPublicProfile: {
      type: Boolean,
      default: true,
    },
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light',
    },
    currentStreak: {
      type: Number,
      default: 0,
    },
    highestStreak: {
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
    subscriptionTier: {
      type: String,
      enum: ['free', 'premium'],
      default: 'free',
    },
    // LeetCode Integration
    leetcodeUsername: {
      type: String,
      default: null,
      sparse: true
    },
    // Holds the unverified username until verification succeeds
    leetcodePendingUsername: {
      type: String,
      default: null
    },
    leetcodeVerificationCode: {
      type: String,
      default: null
    },
    leetcodeVerificationExpiry: {
      type: Date,
      default: null
    },
    leetcodeUsernameChangeCount: {
      type: Number,
      default: 0
    },
    leetcodeLastVerifiedAt: {
      type: Date,
      default: null
    },
    leetcodeProfilePicture: {
      type: String,
      default: ''
    },
    // 'none' = no pending retry; 'pending_retry' = first verify failed, retry window open
    leetcodeVerificationStatus: {
      type: String,
      enum: ['none', 'pending_retry'],
      default: 'none'
    },
    // Timestamp when the retry was scheduled — drives both the 5-min enable and 15-min expiry timers
    leetcodeRetryScheduledAt: {
      type: Date,
      default: null
    },
    // OTP fields for Forgot Password
    resetOtp: {
      type: String,
      default: null,
    },
    resetOtpExpire: {
      type: Date,
      default: null,
    },
    resetOtpAttempts: {
      type: Number,
      default: 0,
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);

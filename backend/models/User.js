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
    showOnLeaderboard: {
      type: Boolean,
      default: true,
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'premium-aurora', 'minimalistic'],
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
      enum: ['free', 'premium', 'refund_pending'],
      default: 'free',
    },

    subscriptionExpiresAt: {
      type: Date,
      default: null,
    },
    subscriptionId: {
      type: String,
      default: null,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
    },
    pendingSubscriptionId: {
      type: String,
      default: null,
    },
    pendingSubscriptionDuration: {
      type: String,
      default: null,
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
    },
    // Blacklist management
    isBlacklisted: {
      type: Boolean,
      default: false,
    },
    blacklistedUntil: {
      type: Date,
      default: null,
    },
    blacklistReason: {
      type: String,
      default: '',
    },
    claimedBadges: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Badge',
    }],
    // Account Lockout fields
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    // Persistent Media Upload Rate Limiting
    imageUploadCount:      { type: Number, default: 0 },
    audioUploadCount:      { type: Number, default: 0 }, // For recordings
    audioFileUploadCount:  { type: Number, default: 0 }, // For manual uploads
    mediaResetTime:        { type: Date, default: Date.now },
    // Firebase Cloud Messaging (Push Notifications)
    fcmTokens: [{
      type: String,
      trim: true,
    }],
    mutedGroups: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
    }],
    lastViewedChangelogAt: {
      type: Date,
      default: null,
    },
    // AI Productivity Insights Bio (Public/Shared)
    productivityBio: {
      type: String,
      default: '',
    },
    // AI Daily Generation tracking
    aiGenerationCount: {
      type: Number,
      default: 0,
    },
    aiGenerationResetTime: {
      type: Date,
      default: Date.now,
    },
    // Weekly AI Summary tracking
    weeklySummaryDailyCount: {
      type: Number,
      default: 0,
    },
    weeklySummaryResetTime: {
      type: Date,
      default: Date.now,
    },
    // Monthly AI Summary tracking
    monthlySummaryDailyCount: {
      type: Number,
      default: 0,
    },
    monthlySummaryResetTime: {
      type: Date,
      default: Date.now,
    },
    monthlySummaryMonthlyCount: {
      type: Number,
      default: 0,
    },
    monthlySummaryMonthlyResetTime: {
      type: Date,
      default: Date.now,
    },
    // AI Daily Task Extraction (Photo Upload) tracking
    aiPhotoExtractionCount: {
      type: Number,
      default: 0,
    },
    aiPhotoExtractionResetTime: {
      type: Date,
      default: Date.now,
    },
    voiceParseCount: {
      type: Number,
      default: 0,
    },
    voiceParseResetTime: {
      type: Date,
      default: Date.now,
    },
    // Canvas AI Chat daily message tracking
    canvasMsgCount: {
      type: Number,
      default: 0,
    },
    canvasMsgResetTime: {
      type: Date,
      default: Date.now,
    },
    // Daily Group Creations limits tracking
    dailyGroupCreationsCount: {
      type: Number,
      default: 0,
    },
    dailyGroupCreationsResetTime: {
      type: Date,
      default: Date.now,
    },
    graceCount: {
      type: Number,
      default: 0,
    },
    graceResetTime: {
      type: Date,
      default: Date.now,
    },
    // Refunds & Abuse tracking
    refundStatus: {
      type: String,
      enum: ['none', 'requested', 'approved', 'rejected'],
      default: 'none',
    },
    refundRequestedAt: {
      type: Date,
      default: null,
    },
    refundReason: {
      type: String,
      default: '',
    },
    premiumActivatedAt: {
      type: Date,
      default: null,
    },
    premiumUsageLogs: [{
      actionType: { type: String, enum: ['voice_parse', 'grace_apply', 'photo_extract'] },
      timestamp: { type: Date, default: Date.now },
      details: String,
      razorpayPaymentId: String,
    }],
    paymentHistory: [{
      orderId: String,
      paymentId: String,
      amount: Number,
      duration: String,
      purchasedAt: { type: Date, default: Date.now },
      refundStatus: {
        type: String,
        enum: ['none', 'requested', 'approved', 'rejected'],
        default: 'none',
      },
      refundReason: {
        type: String,
        default: '',
      },
    }],
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    pointsBalance: {
      type: Number,
      default: 0,
    },
    referralPromptDismissed: {
      type: Boolean,
      default: false,
    },
    lastCompletedDate: {
      type: String,
      default: null,
    },
    globalStreakReminderEnabled: {
      type: Boolean,
      default: true,
    },
    globalStreakReminderTime: {
      type: String,
      default: "21:00",
    },
    globalStreakReminderType: {
      type: String,
      enum: ['notification', 'alarm'],
      default: 'notification',
    },
  },
  { timestamps: true }
);

// Optimize leaderboard queries with compound indexes
UserSchema.index({ showOnLeaderboard: 1, isBlacklisted: 1, currentStreak: -1 });
UserSchema.index({ showOnLeaderboard: 1, isBlacklisted: 1, highestStreak: -1 });

module.exports = mongoose.model('User', UserSchema);

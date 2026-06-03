const mongoose = require('mongoose');

const ReferralSchema = new mongoose.Schema(
  {
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    referredId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    referralCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    streakReached: {
      type: Boolean,
      default: false,
    },
    rewardReleased: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Referral', ReferralSchema);

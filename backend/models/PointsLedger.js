const mongoose = require('mongoose');

const PointsLedgerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    points: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ['signup_bonus', 'referral_reward', 'coupon_redemption', 'refund_adjustment', 'other'],
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PointsLedger', PointsLedgerSchema);

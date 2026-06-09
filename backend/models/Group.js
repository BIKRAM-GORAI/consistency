const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // 6-char alphanumeric join code — generated server-side, unique
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    // The user who created the group
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // All members, including the owner
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isPublic: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    icon: {
      type: String,
      default: '',
    },
    iconId: {
      type: String,
      default: '',
    },
    // Pending join requests for public groups
    requests: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        message: { type: String, maxlength: 200 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    activeMeeting: {
      roomId: { type: String, default: null },
      createdAt: { type: Date, default: null }
    },
    ownerBlacklistedAt: {
      type: Date,
      default: null
    },
    safetyStatus: {
      type: String,
      enum: ['safe', 'warning', 'unknown'],
      default: 'unknown'
    }
  },
  { timestamps: true }
);

GroupSchema.statics.updateOwnerBlacklistStatus = async function(ownerId, isBlacklisted) {
  if (isBlacklisted) {
    // Only set ownerBlacklistedAt if it is not already set
    await this.updateMany(
      { owner: ownerId, ownerBlacklistedAt: null },
      { $set: { ownerBlacklistedAt: new Date() } }
    );
  } else {
    await this.updateMany(
      { owner: ownerId },
      { $set: { ownerBlacklistedAt: null } }
    );
  }
};

module.exports = mongoose.model('Group', GroupSchema);

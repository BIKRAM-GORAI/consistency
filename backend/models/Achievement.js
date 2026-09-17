const mongoose = require('mongoose');
const { Schema } = mongoose;

const AchievementSchema = new mongoose.Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    dayId: {
      type: Schema.Types.ObjectId,
      ref: 'Day',
      required: true,
      index: true,
    },
    // The YYYY-MM-DD string copied from the day — used for sorting without a join
    date: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      trim: true,
      default: '',
      required: function() {
        return this.type !== 'photo';
      },
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    // Array of URLs (supports multiple proof links)
    links: {
      type: [String],
      default: [],
    },
    // Legacy single-link field — kept for backward compat, not written to for new docs
    link: {
      type: String,
      trim: true,
      default: '',
    },
    type: {
      type: String,
      enum: ['text', 'photo'],
      default: 'text',
    },
    photos: [{
      url: {
        type: String,
        required: true,
      },
      thumbnailUrl: {
        type: String,
        default: '',
      },
      publicId: {
        type: String,
        required: true,
      },
      caption: {
        type: String,
        trim: true,
        default: '',
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Achievement', AchievementSchema);

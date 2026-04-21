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
      required: true,
      trim: true,
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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Achievement', AchievementSchema);

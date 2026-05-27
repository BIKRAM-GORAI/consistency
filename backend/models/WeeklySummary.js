const mongoose = require('mongoose');
const { Schema } = mongoose;

const WeeklySummarySchema = new mongoose.Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Binds the summary chronologically right after this specific 7th Day date
    date: {
      type: String, // YYYY-MM-DD of the anchor day
      required: true,
    },
    summaryText: {
      type: String,
      required: true,
    },
    // The range of the week (e.g. "May 18 - May 24") for the header
    rangeText: {
      type: String,
      required: true,
    },
    // Number of days actually summarized (typically 7)
    daysCount: {
      type: Number,
      default: 7,
    },
    // Day IDs that were consolidated in this summary
    dayIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Day',
    }]
  },
  { timestamps: true }
);

module.exports = mongoose.model('WeeklySummary', WeeklySummarySchema);

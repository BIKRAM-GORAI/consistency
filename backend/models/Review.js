const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  userBadges: {
    type: [String],
    default: [], // Array of badges like 'Verified Account', 'Helpful Review', etc.
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

reviewSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);

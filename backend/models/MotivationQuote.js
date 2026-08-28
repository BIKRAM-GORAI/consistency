const mongoose = require('mongoose');

const MotivationQuoteSchema = new mongoose.Schema({
  quoteText: {
    type: String,
    required: true,
    trim: true
  },
  author: {
    type: String,
    default: 'Anonymous',
    trim: true
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

MotivationQuoteSchema.index({ isActive: 1, order: 1 });

module.exports = mongoose.model('MotivationQuote', MotivationQuoteSchema);

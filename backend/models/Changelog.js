const mongoose = require('mongoose');

const ChangelogSchema = new mongoose.Schema({
  message: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ['major', 'minor'],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    required: true,
  }
});

module.exports = mongoose.model('Changelog', ChangelogSchema);

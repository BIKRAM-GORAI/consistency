const mongoose = require('mongoose');

const cronLogSchema = new mongoose.Schema({
  type: {
    type: String, // 'streak' or 'inactive'
    required: true
  },
  userAgent: {
    type: String,
    default: 'unknown'
  },
  emails: [{
    email: String,
    streak: Number,
    daysInactive: Number
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('CronLog', cronLogSchema);

const mongoose = require('mongoose');

const ProfileShareSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  platform: {
    type: String, // e.g., 'whatsapp', 'clipboard', 'native'
    default: 'unknown'
  },
  shareCode: {
    type: String,
    required: true,
    index: true
  },
  sharedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: '0s' } // Deletes the document exactly at the expiresAt timestamp
  }
});

module.exports = mongoose.model('ProfileShare', ProfileShareSchema);

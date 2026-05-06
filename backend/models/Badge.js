const mongoose = require('mongoose');

const BadgeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
      required: true,
    },
    imageId: {
      type: String,
      required: true,
    },
    requiredDays: {
      type: Number,
      required: true,
      unique: true, // Ensuring only one badge per threshold to avoid confusion
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Badge', BadgeSchema);

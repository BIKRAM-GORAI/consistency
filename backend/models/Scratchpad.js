const mongoose = require('mongoose');
const { Schema } = mongoose;

const ScratchpadSchema = new mongoose.Schema(
  {
    dayId: {
      type: Schema.Types.ObjectId,
      ref: 'Day',
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    strokes: {
      type: Schema.Types.Mixed, // flat array of coordinates/times for drawing reconstruction
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Scratchpad', ScratchpadSchema);

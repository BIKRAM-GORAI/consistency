const mongoose = require('mongoose');
const { Schema } = mongoose;

// Task subdocument schema
const TaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  completed: {
    type: Boolean,
    default: false,
  },
});

// Category subdocument schema
const CategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  tasks: [TaskSchema],
});

// Day (main) schema
const DaySchema = new mongoose.Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: String, // stored as YYYY-MM-DD string for easy comparison
      required: true,
    },
    categories: [CategorySchema],
    summary: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Compound unique index: each user can only have one entry per date
DaySchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Day', DaySchema);

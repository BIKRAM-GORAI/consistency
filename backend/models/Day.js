const mongoose = require('mongoose');

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
    date: {
      type: String, // stored as YYYY-MM-DD string for easy comparison
      required: true,
      unique: true,
    },
    categories: [CategorySchema],
    summary: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Day', DaySchema);

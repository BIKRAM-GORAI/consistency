const mongoose = require('mongoose');

// Subtask schema for a goal
const GoalTaskSchema = new mongoose.Schema({
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

// Goal schema
const GoalSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    deadline: {
      type: Date,
      required: true,
    },
    tasks: [GoalTaskSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Goal', GoalSchema);

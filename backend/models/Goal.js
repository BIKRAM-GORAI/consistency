const mongoose = require('mongoose');
const { Schema } = mongoose;

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
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
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

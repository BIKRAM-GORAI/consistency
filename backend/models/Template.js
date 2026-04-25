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

const TemplateSchema = new mongoose.Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    categories: [CategorySchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Template', TemplateSchema);

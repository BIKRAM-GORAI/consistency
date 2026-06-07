const mongoose = require('mongoose');
const { Schema } = mongoose;

const CanvasWorkflowSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    name: {
      type: String,
      default: 'Untitled Flow',
      trim: true
    },
    nodes: {
      type: Schema.Types.Mixed, // Storing nodes: [{ id, label, type, status, x, y, checklist: [] }]
      default: []
    },
    edges: {
      type: Schema.Types.Mixed, // Storing connections: [{ id, from, to, label }]
      default: []
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('CanvasWorkflow', CanvasWorkflowSchema);

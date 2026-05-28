const mongoose = require('mongoose');
const { Schema } = mongoose;

const SingleAppLimitSchema = new mongoose.Schema({
  packageName: {
    type: String,
    required: true,
  },
  appName: {
    type: String,
    required: true,
  },
  limitMinutes: {
    type: Number,
    required: true,
    min: 1,
    max: 1440,
  },
  iconBase64: {
    type: String,
    default: "",
  }
});

const AppLimitSchema = new mongoose.Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    apps: [SingleAppLimitSchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model('AppLimit', AppLimitSchema);

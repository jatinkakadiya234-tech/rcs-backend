import mongoose from "mongoose";

const ResultSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  messageId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['SENT', 'DELIVERED', 'READ', 'FAILED'],
    default: 'SENT'
  },
  statusCode: {
    type: Number,
    default: 200
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  deliveredAt: {
    type: Date
  },
  readAt: {
    type: Date
  },
  response: {
    type: mongoose.Schema.Types.Mixed
  },
  error: {
    type: Boolean,
    default: false
  },
  errorMessage: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes
ResultSchema.index({ campaignId: 1 });
ResultSchema.index({ userId: 1 });
ResultSchema.index({ messageId: 1 }, { unique: true });
ResultSchema.index({ phone: 1 });
ResultSchema.index({ status: 1 });

export default mongoose.model("Result", ResultSchema);
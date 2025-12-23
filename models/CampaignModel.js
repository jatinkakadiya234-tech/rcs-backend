import mongoose from "mongoose";

const CampaignSchema = new mongoose.Schema({
  campaignName: {
    type: String,
    required: true,
    trim: true
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Template',
    required: false
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['text', 'image', 'video', 'text-with-action']
  },
  content: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  audienceCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'completed', 'failed'],
    default: 'draft'
  },
  scheduledAt: {
    type: Date
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  stats: {
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    replied: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Indexes
CampaignSchema.index({ userId: 1, createdAt: -1 });
CampaignSchema.index({ campaignName: 1, userId: 1 });
CampaignSchema.index({ status: 1 });

export default mongoose.model("Campaign", CampaignSchema);
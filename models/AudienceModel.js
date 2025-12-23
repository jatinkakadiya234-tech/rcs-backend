import mongoose from "mongoose";

const AudienceSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true
  },
  phoneNumbers: [{
    type: String,
    required: true
  }],
  totalCount: {
    type: Number,
    required: true
  },
  validCount: {
    type: Number,
    default: 0
  },
  duplicatesRemoved: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
AudienceSchema.index({ campaignId: 1 });

export default mongoose.model("Audience", AudienceSchema);
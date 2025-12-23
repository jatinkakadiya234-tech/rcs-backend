import mongoose from "mongoose";

const CampaignSchema = new mongoose.Schema({
  campaignName: { type: String, required: true },
  templateId: { type:mongoose.Schema.Types.ObjectId,ref:"tbl_Templates",required:true},
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  audienceCount: { type: Number, required: true },
  type: {
    type: String,
    enum: ["text", "carousel", "text-with-action", "rcs", "webview", "dialer-action"],
    required: true,
  },
  content: { type: mongoose.Schema.Types.Mixed, required: true },
  cost: { type: Number, default: 0 },
  successCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

CampaignSchema.index({ userId: 1, createdAt: -1 });
CampaignSchema.index({ campaignName: 1, userId: 1 });
CampaignSchema.index({ isActive: 1 });

export default mongoose.model("tbl_Campaigns", CampaignSchema);

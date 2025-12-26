import mongoose from "mongoose";

const MessageDetailSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "tbl_Campaigns", required: true },
  templateId: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  messageId: { type: String },
  status: { type: String, default: "sent" },
  statusCode: { type: Number },
  errorMessage: { type: String , default: null },
  userReply: { type: Number, default: 0 },
  userClicked: { type: Number, default: 0 },
  entityType: { type: String , default: null },
  suggestionResponse: [{ type: mongoose.Schema.Types.Mixed }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

MessageDetailSchema.index({ campaignId: 1, createdAt: -1 });
MessageDetailSchema.index({ messageId: 1 });
MessageDetailSchema.index({ phoneNumber: 1 });
MessageDetailSchema.index({ status: 1 });

export default mongoose.model("tbl_MessageDetails", MessageDetailSchema);

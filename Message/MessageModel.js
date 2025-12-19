import mongoose from "mongoose";


const MessageSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      "text",
      "carousel",
      "text-with-action",
      "rcs",
      "webview",
      "dialer-action",
    ],
    required: true,
  },
  CampaignName: { type: String, required: true },
  content: { type: mongoose.Schema.Types.Mixed, required: true },
  phoneNumbers: [{ type: String, required: true }],
  status: { type: String, default: "sent" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  cost: { type: Number, default: 0 },
  results: [
    {
      phone: String,
      status: Number,
      messageId: String,
      timestamp: String,
      result: String,
      error: { type: mongoose.Schema.Types.Mixed },
      messaestatus: String,
      errorMessage: String,
      userReplay: Number,
      userCliked: Number,
      entityType: String,
      suggestionResponse: [{ type: mongoose.Schema.Types.Mixed }]
      
    },
  ],
  successCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  failedNumbers: [{ type: String }],
  errorSummary: { type: String },
  errorMessage: { type: String },
  errorDetails: [{ type: mongoose.Schema.Types.Mixed }],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("tbl_Messages", MessageSchema);

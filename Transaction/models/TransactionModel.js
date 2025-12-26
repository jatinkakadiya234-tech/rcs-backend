import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  type: {
    type: String,
    enum: ["credit", "debit"],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  balanceBefore: {
    type: Number,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  },
  source: {
    type: String,
    enum: ["admin_add", "admin_deduct", "wallet_request", "message_send", "refund"],
    required: true
  },
  referenceId: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("tbl_Transactions", TransactionSchema);
import mongoose from "mongoose";

const webhookEventSchema = new mongoose.Schema({
  userPhoneNumber: {
    type: String,
    required: true,
    index: true
  },
  botId: {
    type: String,
    required: true
  },
  entityType: {
    type: String,
    required: true,
    enum: ['USER_EVENT', 'STATUS_EVENT', 'SEND_RESPONSE']
  },
  eventType: {
    type: String,
    required: true,
    enum: ['MESSAGE_DELIVERED', 'MESSAGE_READ', 'SEND_MESSAGE_FAILURE', 'SEND_SUCCESS', 'SEND_FAILURE']
  },
  messageId: {
    type: String,
    required: true,
    index: true
  },
  sendTime: {
    type: String,
    required: true
  },
  senderPhoneNumber: {
    type: String,
    required: true
  },
  eventId: {
    type: String,
    required: true,
    unique: true
  },
  error: {
    code: String,
    errCode: Number,
    message: String
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  rawData: {
    type: Object,
    required: true
  }
}, {
  timestamps: true
});

export default mongoose.model("WebhookEvent", webhookEventSchema);
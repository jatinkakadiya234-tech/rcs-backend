import WebhookEvent from "./WebhookEventModel.js";
import User from "../User/UserModel.js";
import Message from "../Message/MessageModel.js";

const WebhookEventController = {
  storeWebhookEvent: async (webhookData) => {
    try {
      const { userPhoneNumber, botId, entityType, entity } = webhookData;
      
      // Find user by phone number
      const user = await User.findOne({ 
        $or: [
          { phone: userPhoneNumber.replace('+91', '') },
          { phone: userPhoneNumber }
        ]
      });

      const eventData = {
        userPhoneNumber,
        botId,
        entityType,
        eventType: entity.eventType,
        messageId: entity.messageId,
        sendTime: entity.sendTime,
        senderPhoneNumber: entity.senderPhoneNumber,
        eventId: entity.eventId,
        userId: user?._id || null,
        rawData: webhookData
      };

      if (entity.error) {
        eventData.error = entity.error;
      }

      const webhookEvent = new WebhookEvent(eventData);
      await webhookEvent.save();
      
      // Update message status
      await this.updateMessageStatus(entity, userPhoneNumber);
      
      return webhookEvent;
    } catch (error) {
      console.error('Error storing webhook event:', error);
      throw error;
    }
  },

  updateMessageStatus: async (entity, userPhoneNumber) => {
    try {
      const { messageId, eventType, error } = entity;
      
      const message = await Message.findOne({
        'results.messageId': messageId
      });
      
      if (!message) return;
      
      const resultIndex = message.results.findIndex(r => r.messageId === messageId);
      if (resultIndex === -1) return;
      
      switch (eventType) {
        case 'SEND_SUCCESS':
          message.results[resultIndex].status = 'sent';
          break;
        case 'SEND_MESSAGE_FAILURE':
        case 'SEND_FAILURE':
          message.results[resultIndex].status = 'failed';
          message.results[resultIndex].error = error?.message || 'Send failed';
          break;
        case 'MESSAGE_DELIVERED':
          message.results[resultIndex].delivered = true;
          message.results[resultIndex].deliveredAt = new Date();
          break;
        case 'MESSAGE_READ':
          message.results[resultIndex].read = true;
          message.results[resultIndex].readAt = new Date();
          break;
      }
      
      // Recalculate counts
      const successCount = message.results.filter(r => r.status === 'sent').length;
      const failedCount = message.results.filter(r => r.status === 'failed').length;
      const deliveredCount = message.results.filter(r => r.delivered).length;
      const readCount = message.results.filter(r => r.read).length;
      
      message.successCount = successCount;
      message.failedCount = failedCount;
      message.deliveredCount = deliveredCount;
      message.readCount = readCount;
      
      if (failedCount > 0 && successCount === 0) {
        message.status = 'failed';
      } else if (successCount > 0) {
        message.status = 'sent';
      }
      
      await message.save();
      console.log(`Updated message ${messageId}: ${eventType}`);
    } catch (error) {
      console.error('Error updating message status:', error);
    }
  },

  getWebhookEvents: async (req, res) => {
    try {
      const { userId, messageId, eventType, page = 1, limit = 20 } = req.query;
      
      const filter = {};
      if (userId) filter.userId = userId;
      if (messageId) filter.messageId = messageId;
      if (eventType) filter.eventType = eventType;

      const events = await WebhookEvent.find(filter)
        .populate('userId', 'name email phone')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await WebhookEvent.countDocuments(filter);

      res.status(200).send({
        success: true,
        events,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Error fetching webhook events",
        error: error.message
      });
    }
  }
};

export default WebhookEventController;
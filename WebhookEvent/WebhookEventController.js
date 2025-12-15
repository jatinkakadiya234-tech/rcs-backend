import WebhookEvent from "./WebhookEventModel.js";
import User from "../User/UserModel.js";

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
      
      return webhookEvent;
    } catch (error) {
      console.error('Error storing webhook event:', error);
      throw error;
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
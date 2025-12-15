import WebhookEventController from './WebhookEvent/WebhookEventController.js';

const handleRcsWebhook = async (req, res) => {
  try {
    const { userPhoneNumber, botId, entityType, entity } = req.body;
    
    console.log(`Event: ${entityType} - ${entity.eventType}`);
    console.log(`User: ${userPhoneNumber}`);
    
    // Store webhook event in database
    await WebhookEventController.storeWebhookEvent(req.body);
    
    // Handle different event types
    switch (entityType) {
      case 'USER_EVENT':
        handleUserEvent(entity, userPhoneNumber);
        break;
      case 'STATUS_EVENT':
        handleStatusEvent(entity, userPhoneNumber);
        break;
      default:
        console.log('Unknown event type:', entityType);
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
};

const handleUserEvent = (entity, phoneNumber) => {
  switch (entity.eventType) {
    case 'MESSAGE_DELIVERED':
      console.log(`✅ Message delivered to ${phoneNumber}`);
      // Store delivery status
      break;
    case 'MESSAGE_READ':
      console.log(`👁️ Message read by ${phoneNumber}`);
      // Store read status
      break;
  }
};

const handleStatusEvent = (entity, phoneNumber) => {
  switch (entity.eventType) {
    case 'SEND_MESSAGE_FAILURE':
      console.log(`❌ Message failed for ${phoneNumber}: ${entity.error.message}`);
      // Store failure reason
      break;
  }
};

export { handleRcsWebhook };
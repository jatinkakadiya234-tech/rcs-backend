import Message from "../Message/MessageModel.js";

const WebhookController = {
  // Handle Jio webhook responses
  handleJioWebhook: async (req, res) => {
    try {
      const webhookData = req.body;
      console.log("📥 Jio Webhook Received:", JSON.stringify(webhookData, null, 2));

      // Extract messageId from webhook data
      const messageId = webhookData.messageId || webhookData.id;
      
      if (messageId) {
        // Find and update the message with webhook response
        const message = await Message.findOne({
          "results.messageId": messageId
        });

        if (message) {
          // Update the specific result in the message
          const resultIndex = message.results.findIndex(r => r.messageId === messageId);
          if (resultIndex !== -1) {
            message.results[resultIndex].webhookResponse = webhookData;
            message.results[resultIndex].deliveryStatus = webhookData.status || webhookData.eventType;
            message.results[resultIndex].updatedAt = new Date();
            await message.save();
            
            console.log(`✅ Updated message ${messageId} with webhook data`);
          }
        }
      }

      // Respond to Jio that webhook was received
      res.status(200).json({ 
        success: true, 
        message: "Webhook received successfully" 
      });

    } catch (error) {
      console.error("❌ Webhook Error:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
};

export default WebhookController;
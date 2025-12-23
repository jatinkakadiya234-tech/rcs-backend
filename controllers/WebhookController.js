import Result from "../models/ResultModel.js";
import Campaign from "../models/CampaignModel.js";
import { emitMessageUpdate } from "../socket.js";

const WebhookController = {
  handleJioWebhook: async (req, res) => {
    try {
      console.log('📥 Webhook received:', JSON.stringify(req.body, null, 2));
      
      const { messageId, status, timestamp, phone } = req.body;
      
      if (!messageId) {
        return res.status(400).send({ success: false, message: "Missing messageId" });
      }

      // Find and update result
      const result = await Result.findOneAndUpdate(
        { messageId },
        {
          status: status?.toUpperCase() || 'DELIVERED',
          ...(status === 'DELIVERED' && { deliveredAt: new Date(timestamp) }),
          ...(status === 'READ' && { readAt: new Date(timestamp) })
        },
        { new: true }
      );

      if (!result) {
        console.log(`⚠️ Result not found for messageId: ${messageId}`);
        return res.status(404).send({ success: false, message: "Result not found" });
      }

      // Get updated campaign stats
      const campaignStats = await Result.aggregate([
        { $match: { campaignId: result.campaignId } },
        {
          $group: {
            _id: null,
            totalSent: { $sum: 1 },
            delivered: { $sum: { $cond: [{ $eq: ["$status", "DELIVERED"] }, 1, 0] } },
            read: { $sum: { $cond: [{ $eq: ["$status", "READ"] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] } }
          }
        }
      ]);

      const stats = campaignStats[0] || { totalSent: 0, delivered: 0, read: 0, failed: 0 };

      // Update campaign stats
      await Campaign.findByIdAndUpdate(result.campaignId, {
        'stats.sent': stats.totalSent,
        'stats.delivered': stats.delivered,
        'stats.read': stats.read,
        'stats.failed': stats.failed
      });

      // Emit real-time update
      emitMessageUpdate(result.userId, `campaign_${result.campaignId}`, {
        totalSent: stats.totalSent,
        delivered: stats.delivered,
        read: stats.read,
        failed: stats.failed,
        messageId,
        status: result.status,
        phone: result.phone
      });

      console.log(`✅ Status updated: ${messageId} -> ${result.status}`);
      res.status(200).send({ success: true, message: "Webhook processed" });

    } catch (error) {
      console.error('❌ Webhook error:', error);
      res.status(500).send({ success: false, message: "Webhook processing failed" });
    }
  }
};

export default WebhookController;
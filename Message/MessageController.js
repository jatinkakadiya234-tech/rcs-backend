import Message from "./MessageModel.js";
import Template from "../Tamplete/TampletModel.js"
const MessageController = {
  getAllMessages: async (req, res) => {
    try {
      const { id } = req.params;
      const messages = await Message.find({ userId: id }).sort({ createdAt: -1 });
      res.status(200).send({
        success: true,
        data: messages
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Failed to fetch messages",
        error: err.message
      });
    }
  },

  getMessageReports: async (req, res) => {
    try {
      const messages = await Message.find().sort({ createdAt: -1 });
      
      const totalMessages = messages.length;
      const successfulMessages = messages.filter(m => 
        m.results?.some(r => r.status === 201)
      ).length;
      const failedMessages = messages.filter(m => 
        m.results?.every(r => r.status !== 201)
      ).length;

      const messagesByType = messages.reduce((acc, msg) => {
        const existing = acc.find(item => item._id === msg.type);
        if (existing) {
          existing.count++;
        } else {
          acc.push({ _id: msg.type, count: 1 });
        }
        return acc;
      }, []);

      res.status(200).send({
        success: true,
        report: {
          totalMessages,
          successfulMessages,
          failedMessages,
          messagesByType,
          recentMessages: messages.slice(0, 10),
          campaignName:messages.map(m=>m.CampaignName)
          
        }
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Failed to fetch message reports",
        error: err.message
      });
    }
  },

  getRecentOrders: async (req, res) => {
    try {
      const { userId } = req.params;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const recentOrders = await Message.find({ 
        userId,
        createdAt: { $gte: today }
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('type content phoneNumbers status cost results createdAt');

      
      const ordersWithCounts = recentOrders.map(order => ({
        ...order.toObject(),
        successCount: order.results?.filter(r => r.messaestatus === "MESSAGE_DELIVERED" || r.messaestatus === "MESSAGE_READ" || r.messaestatus==="SEND_MESSAGE_SUCCESS").length || 0,
        failedCount: order.results?.filter(r => r.messaestatus === "SEND_MESSAGE_FAILURE").length || 0
      }));
      
      res.status(200).send({
        success: true,
        data: ordersWithCounts,
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Failed to fetch recent orders",
        error: err.message
      });
    }
  },

  getUserMessageStats: async (req, res) => {
    try {
      const { userId } = req.params;
      console.log(userId);
      const messages = await Message.find({ userId });
      
      const totalMessages = messages.length;
      const failedMessages = messages.filter(m => m.failedCount > 0).length;
      const sentMessages = messages.filter(m => m.successCount > 0).length;
      let sendtoteltemplet = await (await Template.find({userId:userId})).length;
    

      
      res.status(200).send({
        success: true,
        data: {
          totalMessages,
          failedMessages,
          pendingMessages: messages.filter(m => m.failedCount === 0 && m.successCount === 0).length,
          sentMessages,
          sendtoteltemplet
        }
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Failed to fetch user message stats",
        error: err.message
      });
    }
  },

  deleteMessage: async (req, res) => {
    try {
      const { id } = req.params;
      
      const deletedMessage = await Message.findByIdAndDelete(id);
      
      if (!deletedMessage) {
        return res.status(404).send({
          success: false,
          message: "Message not found"
        });
      }

      res.status(200).send({
        success: true,
        message: "Message deleted successfully",
        data: deletedMessage
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Failed to delete message",
        error: err.message
      });
    }
  }
};

export default MessageController;
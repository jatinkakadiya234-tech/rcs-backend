import Message from "./MessageModel.js";

const MessageController = {
  getAllMessages: async (req, res) => {
    try {
      const messages = await Message.find().sort({ createdAt: -1 });
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
          recentMessages: messages.slice(0, 10)
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
import Message from "./MessageModel.js";
import Template from "../Tamplete/TampletModel.js";
import mongoose from "mongoose";
import { getIO } from "../socket.js";

const MessageController = {
  //----------getAllMessages-------(New)-----------
  getAllMessages: async (req, res) => {
    const startTime = process.hrtime();

    try {
      const { id } = req.params;
      let { page = 1, limit = 10 } = req.query;

      page = parseInt(page);
      limit = parseInt(limit);

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid userId",
        });
      }

      const filter = { userId: id };

      const [messages, total] = await Promise.all([
        Message.find(filter)
          .select(
            "_id type CampaignName cost successCount failedCount createdAt"
          )
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),

        Message.countDocuments(filter),
      ]);

      const diff = process.hrtime(startTime);
      const executionTimeMs = (diff[0] * 1e3 + diff[1] / 1e6).toFixed(2);

      // console.log(
      //   `${executionTimeMs} ms`,
      //   "=====executionTimeMs======================="
      // );

      try {
        const io = getIO();
        io.to(`user_${id}`).emit('messagesUpdated', { messages, total });
      } catch (socketErr) {
        console.log('Socket emit failed:', socketErr.message);
      }

      return res.status(200).json({
        success: true,
        data: messages,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        performance: {
          executionTimeMs: `${executionTimeMs} ms`,
        },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch messages",
        error: err.message,
      });
    }
  },

  //----------getMessageById----------------

  getMessageById: async (req, res) => {
    const start = process.hrtime();
    const message = await Message.findById(req.params.id)
      .select("results successCount failedCount")
      .lean();

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found"
      });
    }

    // Count based on messaestatus
    let totalSent = 0;
    let totalDelivered = 0;
    let totalRead = 0;
    let totalFailed = 0;

    if (message.results && message.results.length > 0) {
      message.results.forEach(result => {
        const status = result.messaestatus;
        
        if (status === "SEND_MESSAGE_SUCCESS") {
          totalSent++;
        } else if (status === "DELIVERED") {
          totalDelivered++;
        } else if (status === "READ" || status === "READ_MESSAGE") {
          totalRead++;
        } else if (status && status.includes("FAIL")) {
          totalFailed++;
        }
      });
    }

    const diff = process.hrtime(start);
    
    try {
      const io = getIO();
      io.emit('messageViewed', { messageId: req.params.id });
    } catch (socketErr) {
      console.log('Socket emit failed:', socketErr.message);
    }

    res.json({
      success: true,
      data: {
        ...message,
        totalSent,
        totalDelivered,
        totalRead,
        totalFailed,
        totalResults: message.results?.length || 0
      },
      executionTimeMs: (diff[0] * 1e3 + diff[1] / 1e6).toFixed(2) + " ms",
    });
  },

  getMessageReports: async (req, res) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const skip = (page - 1) * limit;

      const total = await Message.countDocuments();

      // Optimized query with field selection
      const messages = await Message.find()
        .select(
          "_id type CampaignName cost successCount failedCount -createdAt userId"
        )
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean();

      // Use pre-calculated counts from Message model
      const successfulMessages = await Message.aggregate([
        { $group: { _id: null, total: { $sum: "$successCount" } } },
      ]);

      const failedMessages = await Message.aggregate([
        { $group: { _id: null, total: { $sum: "$failedCount" } } },
      ]);

      const messagesByType = await Message.aggregate([
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]);

      try {
        const io = getIO();
        io.emit('reportsUpdated', { total, successfulMessages: successfulMessages[0]?.total || 0 });
      } catch (socketErr) {
        console.log('Socket emit failed:', socketErr.message);
      }

      res.status(200).send({
        success: true,
        report: {
          totalMessages: total,
          successfulMessages: successfulMessages[0]?.total || 0,
          failedMessages: failedMessages[0]?.total || 0,
          messagesByType,
          messages,
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Failed to fetch message reports",
        error: err.message,
      });
    }
  },

  getRecentOrders: async (req, res) => {
    try {
      const { userId } = req.params;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Optimized query with lean and pre-calculated counts
      const recentOrders = await Message.find({
        userId,
        createdAt: { $gte: today },
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .select(
          "_id type CampaignName cost successCount failedCount createdAt phoneNumbers"
        )
        .lean();

      // Use pre-calculated counts instead of processing results array
      const ordersWithCounts = recentOrders.map((order) => ({
        ...order,
        successCount: order.successCount || 0,
        failedCount: order.failedCount || 0,
        totalNumbers: order.phoneNumbers?.length || 0,
      }));

      try {
        const io = getIO();
        io.to(`user_${userId}`).emit('recentOrdersUpdated', { orders: ordersWithCounts });
      } catch (socketErr) {
        console.log('Socket emit failed:', socketErr.message);
      }

      res.status(200).send({
        success: true,
        data: ordersWithCounts,
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Failed to fetch recent orders",
        error: err.message,
      });
    }
  },

  getUserMessageStats: async (req, res) => {
    try {
      const { userId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid userId",
        });
      }

      const userObjectId = new mongoose.Types.ObjectId(userId);

      // Use aggregation for better performance
      const [stats, templateCount] = await Promise.all([
        Message.aggregate([
          { $match: { userId: userObjectId } },
          {
            $group: {
              _id: null,
              totalMessages: { $sum: 1 },
              totalSuccess: { $sum: "$successCount" },
              totalFailed: { $sum: "$failedCount" },
              messagesWithSuccess: {
                $sum: { $cond: [{ $gt: ["$successCount", 0] }, 1, 0] },
              },
              messagesWithFailures: {
                $sum: { $cond: [{ $gt: ["$failedCount", 0] }, 1, 0] },
              },
              pendingMessages: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ["$successCount", 0] }, { $eq: ["$failedCount", 0] }] },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]),
        Template.countDocuments({ userId: userObjectId }),
      ]);

      const result = stats[0] || {
        totalMessages: 0,
        totalSuccess: 0,
        totalFailed: 0,
        messagesWithSuccess: 0,
        messagesWithFailures: 0,
        pendingMessages: 0,
      };

      try {
        const io = getIO();
        io.to(`user_${userId}`).emit('userStatsUpdated', { 
          // totalMessages: result.totalMessages,
          failedMessages: result.messagesWithFailures,
          pendingMessages: result.pendingMessages,
          sentMessages: result.messagesWithSuccess,
            totalMessages:result.totalFailed+ result.totalSuccess,
        });
      } catch (socketErr) {
        console.log('Socket emit failed:', socketErr.message);
      }

      res.status(200).send({
        success: true,
        data: {
          failedMessages: result.messagesWithFailures,
          pendingMessages: result.pendingMessages,
          sentMessages: result.messagesWithSuccess,
          sendtoteltemplet: templateCount,
          totalCampaigns: result.totalMessages,
          totalSuccessCount: result.totalSuccess,
          totalFailedCount: result.totalFailed,
          totalMessages:result.totalFailed+ result.totalSuccess,
        },
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Failed to fetch user message stats",
        error: err.message,
      });
    }
  },

  getMessageDetails: async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 50 } = req.query;

      // Get basic message info first
      const message = await Message.findById(id)
        .select("_id type CampaignName cost successCount failedCount createdAt")
        .lean();

      if (!message) {
        return res.status(404).send({
          success: false,
          message: "Message not found",
        });
      }

      // Get total count efficiently
      const totalResults = await Message.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(id) } },
        { $project: { resultCount: { $size: "$results" } } }
      ]);
      
      const total = totalResults[0]?.resultCount || 0;
      const skip = (page - 1) * limit;
      
      // Get paginated results
      const resultsData = await Message.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(id) } },
        { $project: { results: { $slice: ["$results", skip, parseInt(limit)] } } }
      ]);

      const results = resultsData[0]?.results?.map(r => ({
        phone: r?.phone,
        status: r?.status,
        messaestatus: r?.messaestatus,
        errorMessage: r?.errorMessage || null,
        suggestionResponse: r?.suggestionResponse || []
      })) || [];

      try {
        const io = getIO();
        io.emit('messageDetailsViewed', { messageId: id, resultsCount: total });
      } catch (socketErr) {
        console.log('Socket emit failed:', socketErr.message);
      }

      res.status(200).send({
        success: true,
        data: {
          ...message,
          results,
          resultsPagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Failed to fetch message details",
        error: err.message,
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
          message: "Message not found",
        });
      }



      try {
        const io = getIO();
        io.to(`user_${deletedMessage.userId}`).emit('messageDeleted', { messageId: id });
      } catch (socketErr) {
        console.log('Socket emit failed:', socketErr.message);
      }

      res.status(200).send({
        success: true,
        message: "Message deleted successfully",
        data: deletedMessage,
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Failed to delete message",
        error: err.message,
      });
    }
  },

};

export default MessageController;

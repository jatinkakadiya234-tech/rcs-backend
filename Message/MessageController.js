import Message from "./MessageModel.js";
import Template from "../Tamplete/TampletModel.js";
import mongoose from "mongoose";

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
      .select("results")
      .lean();

    const diff = process.hrtime(start);
    res.json({
      success: true,
      data: message,
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
          "_id type CampaignName cost successCount failedCount createdAt userId"
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

      // Optimized aggregation queries
      const [messageStats, templateCount] = await Promise.all([
        Message.aggregate([
          { $match: { userId: userId } },
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
                    {
                      $and: [
                        { $eq: ["$successCount", 0] },
                        { $eq: ["$failedCount", 0] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]),
        Template.countDocuments({ userId }),
      ]);

      const stats = messageStats[0] || {
        totalMessages: 0,
        messagesWithSuccess: 0,
        messagesWithFailures: 0,
        pendingMessages: 0,
      };

      res.status(200).send({
        success: true,
        data: {
          totalMessages: stats.totalMessages,
          failedMessages: stats.messagesWithFailures,
          pendingMessages: stats.pendingMessages,
          sentMessages: stats.messagesWithSuccess,
          sendtoteltemplet: templateCount,
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
      const { page = 1, limit = 50 } = req.query; // 50 results per page

      // Get message with paginated results
      const message = await Message.findById(id)
        .select("_id type CampaignName cost successCount failedCount createdAt")
        .lean();

      if (!message) {
        return res.status(404).send({
          success: false,
          message: "Message not found",
        });
      }

      // Get paginated results separately
      const fullMessage = await Message.findById(id).select("results").lean();
      const allResults = fullMessage?.results || [];

      const skip = (page - 1) * limit;
      const paginatedResults = allResults.slice(skip, skip + limit);
      const totalResults = allResults.length;

      res.status(200).send({
        success: true,
        data: {
          ...message,
          results: paginatedResults,
          resultsPagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: totalResults,
            pages: Math.ceil(totalResults / limit),
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

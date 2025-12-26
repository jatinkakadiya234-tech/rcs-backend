import Message from "../models/MessageModel.js";
import Template from "../../Tamplete/models/TampletModel.js";
import mongoose from "mongoose";
import { getIO } from "../../socket.js";
import Transaction from "../../Transaction/models/TransactionModel.js";

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
        .select("_id type CampaignName cost successCount failedCount createdAt userReplyCount userClickCount totalDelivered totalRead")
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

  // Weekly Analytics
 

  // Admin Weekly Analytics - All Users
  getAdminWeeklyAnalytics: async (req, res) => {
    try {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);

      const weeklyData = await Message.aggregate([
        {
          $match: {
            createdAt: { $gte: weekStart }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            totalMessages: { $sum: 1 },
            totalSent: { $sum: "$successCount" },
            totalFailed: { $sum: "$failedCount" },
            totalUsers: { $addToSet: "$userId" },
            dayOfWeek: { $first: { $dayOfWeek: "$createdAt" } }
          }
        },
        {
          $addFields: {
            totalUsers: { $size: "$totalUsers" },
            weekName: {
              $switch: {
                branches: [
                  { case: { $eq: ["$dayOfWeek", 1] }, then: "Sunday" },
                  { case: { $eq: ["$dayOfWeek", 2] }, then: "Monday" },
                  { case: { $eq: ["$dayOfWeek", 3] }, then: "Tuesday" },
                  { case: { $eq: ["$dayOfWeek", 4] }, then: "Wednesday" },
                  { case: { $eq: ["$dayOfWeek", 5] }, then: "Thursday" },
                  { case: { $eq: ["$dayOfWeek", 6] }, then: "Friday" },
                  { case: { $eq: ["$dayOfWeek", 7] }, then: "Saturday" }
                ],
                default: "Unknown"
              }
            }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      res.status(200).json({
        success: true,
        data: weeklyData
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch admin weekly analytics",
        error: err.message
      });
    }
  },

  // Admin Monthly Analytics - All Users


  // Create Demo Data


  // Admin Summary - Total Users, Amounts, and Active Users
  getAdminSummary: async (req, res) => {
    try {
      const currentMonth = new Date();
      currentMonth.setDate(1);
      currentMonth.setHours(0, 0, 0, 0);
      
      const lastMonth = new Date(currentMonth);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      const [userStats, transactionStats, activeUsers, currentMonthStats, lastMonthStats, lastMonthActiveUsers] = await Promise.all([
        // Get total users and message costs
        Message.aggregate([
          {
            $group: {
              _id: null,
              totalUsers: { $addToSet: "$userId" },
              totalMessageCost: { $sum: "$cost" },
              totalMessages: { $sum: 1 }
            }
          },
          {
            $addFields: {
              totalUsers: { $size: "$totalUsers" }
            }
          }
        ]),
        
        // Get total transaction amounts
        Transaction.aggregate([
          {
            $group: {
              _id: null,
              totalTransactionAmount: { $sum: "$amount" },
              totalTransactions: { $sum: 1 },
              uniqueUsers: { $addToSet: "$userId" }
            }
          },
          {
            $addFields: {
              uniqueTransactionUsers: { $size: "$uniqueUsers" }
            }
          }
        ]),
        
        // Get active users (users who sent messages in last 30 days)
        Message.aggregate([
          {
            $match: {
              createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            }
          },
          {
            $group: {
              _id: null,
              activeUsers: { $addToSet: "$userId" }
            }
          },
          {
            $addFields: {
              activeUserCount: { $size: "$activeUsers" }
            }
          }
        ]),
        
        // Current month stats
        Message.aggregate([
          {
            $match: {
              createdAt: { $gte: currentMonth }
            }
          },
          {
            $group: {
              _id: null,
              currentMonthMessages: { $sum: 1 },
              currentMonthCost: { $sum: "$cost" },
              currentMonthUsers: { $addToSet: "$userId" }
            }
          },
          {
            $addFields: {
              currentMonthUsers: { $size: "$currentMonthUsers" }
            }
          }
        ]),
        
        // Last month stats
        Message.aggregate([
          {
            $match: {
              createdAt: { 
                $gte: lastMonth,
                $lt: currentMonth
              }
            }
          },
          {
            $group: {
              _id: null,
              lastMonthMessages: { $sum: 1 },
              lastMonthCost: { $sum: "$cost" },
              lastMonthUsers: { $addToSet: "$userId" }
            }
          },
          {
            $addFields: {
              lastMonthUsers: { $size: "$lastMonthUsers" }
            }
          }
        ]),
        
        // Last month active users
        Message.aggregate([
          {
            $match: {
              createdAt: { 
                $gte: new Date(lastMonth.getTime() - 30 * 24 * 60 * 60 * 1000),
                $lt: lastMonth
              }
            }
          },
          {
            $group: {
              _id: null,
              lastMonthActiveUsers: { $addToSet: "$userId" }
            }
          },
          {
            $addFields: {
              lastMonthActiveUserCount: { $size: "$lastMonthActiveUsers" }
            }
          }
        ])
      ]);

      const userResult = userStats[0] || {
        totalUsers: 0,
        totalMessageCost: 0,
        totalMessages: 0
      };

      const transactionResult = transactionStats[0] || {
        totalTransactionAmount: 0,
        totalTransactions: 0,
        uniqueTransactionUsers: 0
      };

      const activeResult = activeUsers[0] || {
        activeUserCount: 0
      };
      
      const lastMonthActiveResult = lastMonthActiveUsers[0] || {
        lastMonthActiveUserCount: 0
      };
      
      const currentResult = currentMonthStats[0] || {
        currentMonthMessages: 0,
        currentMonthCost: 0,
        currentMonthUsers: 0
      };
      
      const lastResult = lastMonthStats[0] || {
        lastMonthMessages: 0,
        lastMonthCost: 0,
        lastMonthUsers: 0
      };
      
      // Calculate growth percentages
      const activeUserGrowth = lastMonthActiveResult.lastMonthActiveUserCount > 0
        ? ((activeResult.activeUserCount - lastMonthActiveResult.lastMonthActiveUserCount) / lastMonthActiveResult.lastMonthActiveUserCount * 100).toFixed(2)
        : activeResult.activeUserCount > 0 ? 100 : 0;
        
      const totalGrowth = lastResult.lastMonthMessages > 0
        ? ((currentResult.currentMonthMessages - lastResult.lastMonthMessages) / lastResult.lastMonthMessages * 100).toFixed(2)
        : currentResult.currentMonthMessages > 0 ? 100 : 0;
        
      // Calculate message growth direction and exact count with cost and percentage
      const messageDifference = currentResult.currentMonthMessages - lastResult.lastMonthMessages;
      const costDifference = currentResult.currentMonthCost - lastResult.lastMonthCost;
      const messageGrowthDirection = messageDifference > 0 ? 'increase' : 
                                   messageDifference < 0 ? 'decrease' : 'same';
      const messageGrowthCount = Math.abs(messageDifference);
      const messageGrowthCost = Math.abs(costDifference);
      
      // Calculate message growth percentage
      const messageGrowthPercentage = lastResult.lastMonthMessages > 0
        ? ((messageDifference / lastResult.lastMonthMessages) * 100).toFixed(2)
        : messageDifference > 0 ? 100 : 0;
      
      // Calculate overall success rate
      const totalSentMessages = await Message.aggregate([
        { $group: { _id: null, totalSent: { $sum: "$successCount" }, totalFailed: { $sum: "$failedCount" } } }
      ]);
      
      const sentResult = totalSentMessages[0] || { totalSent: 0, totalFailed: 0 };
      const totalAttempts = sentResult.totalSent + sentResult.totalFailed;
      const successRate = totalAttempts > 0 ? ((sentResult.totalSent / totalAttempts) * 100).toFixed(2) : 0;

      res.status(200).json({
        success: true,
        data: {
          totalUsers: userResult.totalUsers,
          activeUsers: activeResult.activeUserCount,
          totalMessages: userResult.totalMessages,
          totalMessageCost: userResult.totalMessageCost,
          totalTransactions: transactionResult.totalTransactions,
          totalTransactionAmount: transactionResult.totalTransactionAmount,
          uniqueTransactionUsers: transactionResult.uniqueTransactionUsers,
          totalAmount: userResult.totalMessageCost + transactionResult.totalTransactionAmount,
          totalGrowth: `${totalGrowth}%`,
          activeUserGrowth: `${activeUserGrowth}%`,
          messageGrowthDirection: messageGrowthDirection,
          messageGrowthCount: `${messageGrowthPercentage}%`,
          successRate: `${successRate}%`,
          currentMonthMessages: currentResult.currentMonthMessages,
          lastMonthMessages: lastResult.lastMonthMessages
        }
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch admin summary",
        error: err.message
      });
    }
  },
 getMonthlyChartData: async (req, res) => {
  try {
    // Get last 2 months date range
    const currentDate = new Date();
    const twoMonthsAgo = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    
    const [messageData, transactionData] = await Promise.all([
      // Get monthly message data for last 2 months
      Message.aggregate([
        {
          $match: {
            createdAt: { $gte: twoMonthsAgo }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" }
            },
            revenue: { $sum: "$cost" },
            users: { $addToSet: "$userId" }
          }
        },
        {
          $addFields: {
            users: { $size: "$users" },
            month: {
              $switch: {
                branches: [
                  { case: { $eq: ["$_id.month", 1] }, then: "Jan" },
                  { case: { $eq: ["$_id.month", 2] }, then: "Feb" },
                  { case: { $eq: ["$_id.month", 3] }, then: "Mar" },
                  { case: { $eq: ["$_id.month", 4] }, then: "Apr" },
                  { case: { $eq: ["$_id.month", 5] }, then: "May" },
                  { case: { $eq: ["$_id.month", 6] }, then: "Jun" },
                  { case: { $eq: ["$_id.month", 7] }, then: "Jul" },
                  { case: { $eq: ["$_id.month", 8] }, then: "Aug" },
                  { case: { $eq: ["$_id.month", 9] }, then: "Sep" },
                  { case: { $eq: ["$_id.month", 10] }, then: "Oct" },
                  { case: { $eq: ["$_id.month", 11] }, then: "Nov" },
                  { case: { $eq: ["$_id.month", 12] }, then: "Dec" }
                ],
                default: "Unknown"
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            month: 1,
            revenue: 1,
            users: 1
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
      ]),
      
      // Get monthly transaction data for last 2 months
      Transaction.aggregate([
        {
          $match: {
            createdAt: { $gte: twoMonthsAgo }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" }
            },
            transactionAmount: { $sum: "$amount" },
            transactionUsers: { $addToSet: "$userId" }
          }
        },
        {
          $addFields: {
            transactionUsers: { $size: "$transactionUsers" },
            month: {
              $switch: {
                branches: [
                  { case: { $eq: ["$_id.month", 1] }, then: "Jan" },
                  { case: { $eq: ["$_id.month", 2] }, then: "Feb" },
                  { case: { $eq: ["$_id.month", 3] }, then: "Mar" },
                  { case: { $eq: ["$_id.month", 4] }, then: "Apr" },
                  { case: { $eq: ["$_id.month", 5] }, then: "May" },
                  { case: { $eq: ["$_id.month", 6] }, then: "Jun" },
                  { case: { $eq: ["$_id.month", 7] }, then: "Jul" },
                  { case: { $eq: ["$_id.month", 8] }, then: "Aug" },
                  { case: { $eq: ["$_id.month", 9] }, then: "Sep" },
                  { case: { $eq: ["$_id.month", 10] }, then: "Oct" },
                  { case: { $eq: ["$_id.month", 11] }, then: "Nov" },
                  { case: { $eq: ["$_id.month", 12] }, then: "Dec" }
                ],
                default: "Unknown"
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            month: 1,
            revenue: "$transactionAmount",
            users: "$transactionUsers"
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        messageData,
        transactionData
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch monthly chart data",
      error: err.message
    });
  }
},

  getWeeklyChartData: async (req, res) => {
    try {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);

      const messageData = await Message.aggregate([
        {
          $match: {
            createdAt: { $gte: weekStart }
          }
        },
        {
          $group: {
            _id: { $dayOfWeek: "$createdAt" },
            count: { $sum: "$cost" },
            
          }
        }
      ]);

      // Create complete week data with all days
      const weekData = [
        { day: "Mon", count: 0, },
        { day: "Tue", count: 0,  },
        { day: "Wed", count: 0,  },
        { day: "Thu", count: 0, },
        { day: "Fri", count: 0,  },
        { day: "Sat", count: 0, },
        { day: "Sun", count: 0,  }
      ];

      // Map MongoDB day numbers to array indices
      const dayMap = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 1: 6 }; // Mon=0, Tue=1, ..., Sun=6

      // Fill in actual counts and costs
      messageData.forEach(item => {
        const dayIndex = dayMap[item._id];
        if (dayIndex !== undefined) {
          weekData[dayIndex].count = item.count;
          weekData[dayIndex].cost = item.cost;
        }
      });

      res.status(200).json({
        success: true,
        data: weekData
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch weekly chart data",
        error: err.message
      });
    }
  }

};

// Monthly Chart Data - Messages and Transactions



export default MessageController;

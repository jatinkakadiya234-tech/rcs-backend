import User from "../../User/models/UserModel.js";
import TransactionModel from "../models/TransactionModel.js";

const TransactionController = {
  createTransaction: async (userId, type, amount, description, source, referenceId = null) => {
    try {
      const user = await User.findById(userId);
      const balanceBefore = user.Wallet;
      const balanceAfter = type === "credit" ? balanceBefore + amount : balanceBefore - amount;
      
      const transaction = new TransactionModel({
        userId,
        type,
        amount,
        description,
        balanceBefore,
        balanceAfter,
        source,
        referenceId
      });
      
      await transaction.save();
      return transaction;
    } catch (error) {
      console.error("Transaction creation error:", error);
      throw error;
    }
  },

  getUserTransactions: async (req, res) => {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 20 } = req.query;
      
      const transactions = await Transaction.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
        
      const total = await Transaction.countDocuments({ userId });
      
      res.status(200).send({
        success: true,
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  getUserTransactionSummary: async (req, res) => {
    try {
      const { userId } = req.params;
      
      const user = await User.findById(userId).select("name email Wallet");
      if (!user) {
        return res.status(404).send({ success: false, message: "User not found" });
      }
      
      const transactions = await Transaction.find({ userId });
      
      const totalCredit = transactions
        .filter(t => t.type === "credit")
        .reduce((sum, t) => sum + t.amount, 0);
        
      const totalDebit = transactions
        .filter(t => t.type === "debit")
        .reduce((sum, t) => sum + t.amount, 0);
      
      const summary = {
        user: {
          name: user.name,
          email: user.email,
          currentBalance: user.Wallet
        },
        totalTransactions: transactions.length,
        totalCredit,
        totalDebit,
        netAmount: totalCredit - totalDebit,
        recentTransactions: transactions.slice(0, 5)
      };
      
      res.status(200).send({ success: true, summary });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  getAllTransactions: async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      
      const transactions = await Transaction.find()
        .populate("userId", "name email")
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
        
      const total = await Transaction.countDocuments();
      
      res.status(200).send({
        success: true,
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  }
};

export default TransactionController;
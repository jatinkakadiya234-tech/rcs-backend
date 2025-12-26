import express from "express";
import TransactionController from "../controllers/TransactionController.js";



const transactionRouter = express.Router();

// User transaction APIs
transactionRouter.get("/user/:userId", TransactionController.getUserTransactions);
transactionRouter.get("/user/:userId/summary", TransactionController.getUserTransactionSummary);

// Admin transaction APIs
transactionRouter.get("/admin/all", TransactionController.getAllTransactions);

export default transactionRouter;
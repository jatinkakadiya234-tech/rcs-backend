import express from "express";
import MessageController from "../controllers/MessageController.js";

const messagerouter = express.Router();

// 📊 Get Message Report
messagerouter.get("/report", MessageController.getMessageReports);

// 📋 Get All Messages
messagerouter.get("/alls/:id", MessageController.getAllMessages);

// Get Message by ID--
messagerouter.get("/getrReportBy/:id", MessageController.getMessageById);

// 📄 Get Message Details (with results)
messagerouter.get("/details/:id", MessageController.getMessageDetails);

// 🕒 Get Recent Orders (Top 10)
messagerouter.get("/recent/:userId", MessageController.getRecentOrders);

// 📊 Get User Message Statistics
messagerouter.get("/stats/:userId", MessageController.getUserMessageStats);

// 📈 Weekly Chart Data
messagerouter.get("/chart/weekly", MessageController.getWeeklyChartData);

// 🔧 Admin Weekly Analytics - All Users
messagerouter.get("/admin/analytics/weekly", MessageController.getWeeklyChartData);

// 🔧 Admin Monthly Analytics - All Users
messagerouter.get("/admin/analytics/monthly", MessageController.getMonthlyChartData);



// 📊 Admin Summary - Total Users & Amounts
messagerouter.get("/admin/summary", MessageController.getAdminSummary);

// 📈 Monthly Chart Data


// 📱 Check Messages for Phone Number
// messagerouter.get("/check/:phoneNumber", checkNumberMessages);
messagerouter.delete("/:id", MessageController.deleteMessage);
export default messagerouter;

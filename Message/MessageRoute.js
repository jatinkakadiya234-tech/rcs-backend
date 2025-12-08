import express from "express";
import MessageController from "./MessageController.js";


const messagerouter = express.Router();

// 📊 Get Message Report
messagerouter.get("/report", MessageController.getMessageReports);

// 📋 Get All Messages
messagerouter.get("/alls", MessageController.getAllMessages);
    
// 📱 Check Messages for Phone Number
// messagerouter.get("/check/:phoneNumber", checkNumberMessages);
messagerouter.delete("/:id", MessageController.deleteMessage);
export default messagerouter;
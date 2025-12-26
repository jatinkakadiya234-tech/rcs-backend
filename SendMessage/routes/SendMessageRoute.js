import express from "express";
import SendMessageController from "../controllers/SendMessageController.js";

const router = express.Router();

router.post("/send", SendMessageController.sendMessage);

export default router;
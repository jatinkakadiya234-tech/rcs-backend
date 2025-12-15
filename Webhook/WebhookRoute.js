import express from "express";
import WebhookController from "./WebhookController.js";

const router = express.Router();

// Jio webhook endpoint
router.post("/jio", WebhookController.handleJioWebhook);

export default router;
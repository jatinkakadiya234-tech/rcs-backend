import express from "express";
import WebhookEventController from "./WebhookEventController.js";
import { handleRcsWebhook } from "../rcsWebhookHandler.js";

const router = express.Router();

router.post("/api/jio/rcs/webhook", handleRcsWebhook);
router.get("/api/webhook-events", WebhookEventController.getWebhookEvents);

export default router;
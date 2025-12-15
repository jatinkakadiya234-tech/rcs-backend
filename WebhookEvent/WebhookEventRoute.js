import express from "express";
import WebhookEventController from "./WebhookEventController.js";

const router = express.Router();

const handleRcsWebhook = async (req, res) => {
  try {
    console.log("HEADERS:", req.headers);
    console.log("BODY:", JSON.stringify(req.body, null, 2));
    
    await WebhookEventController.storeWebhookEvent(req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
};

router.post("/api/jio/rcs/webhook", handleRcsWebhook);
router.get("/api/webhook-events", WebhookEventController.getWebhookEvents);

export default router;
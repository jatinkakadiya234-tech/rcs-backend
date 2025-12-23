import express from "express";
import WebhookController from "../controllers/WebhookController.js";

const router = express.Router();

router.post("/jio-status", WebhookController.handleJioWebhook);

export default router;
import express from "express";
import CampaignController from "./CampaignController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

router.get("/campaigns", authenticateToken, CampaignController.getAllCampaigns);
router.get("/campaigns/:id", authenticateToken, CampaignController.getCampaignById);
router.get("/campaigns/:id/messages", authenticateToken, CampaignController.getCampaignMessages);
router.delete("/campaigns/:id", authenticateToken, CampaignController.deleteCampaign);

export default router;

import express from "express";
import { authenticateToken } from "../../middleware/cookieAuth.js";
import CampaignController from "../controllers/CampaignController.js";

const router = express.Router();

router.get("/campaigns", authenticateToken, CampaignController.getAllCampaigns);
router.get("/campaigns/:id", authenticateToken, CampaignController.getCampaignById);
router.get("/campaigns/:id/messages", authenticateToken, CampaignController.getCampaignMessages);
router.delete("/campaigns/:id", authenticateToken, CampaignController.deleteCampaign);

export default router;

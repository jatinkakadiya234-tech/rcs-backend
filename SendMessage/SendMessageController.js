import Message from "../Message/MessageModel.js";
import User from "../User/UserModel.js";
import Campaign from "../models/CampaignModel.js";
import Audience from "../models/AudienceModel.js";
import { fetchJioToken } from "../services/JioTokenService.js";
import { sendJioSms } from "../services/JioSmsService.js";

const SendMessageController = {
  sendMessage: async (req, res) => {
    const { sendMessagesInBatches } = await import("../utils/batchSender.js");
    const { processRetryQueue } = await import("../utils/retryQueue.js");
    
    try {
      const { type, content, phoneNumbers, userId, campaignName, templateId } = req.body;

      if (
        !type ||
        !content ||
        !phoneNumbers?.length ||
        !userId ||
        !campaignName
      ) {
        return res.status(400).send({
          success: false,
          message: "Missing required fields",
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }

      const totalCost = phoneNumbers.length * 1;

      if (user.Wallet < totalCost) {
        return res.status(400).send({
          success: false,
          message: "Insufficient balance",
          required: totalCost,
          available: user.Wallet,
        });
      }

      // Create campaign
      console.log('Creating campaign with data:', {
        campaignName,
        templateId,
        userId,
        type,
        content: typeof content,
        audienceCount: phoneNumbers.length
      });
      
      const createCampaign = await Campaign.create({
        campaignName,
        templateId,
        userId,
        type,
        content,
        audienceCount: phoneNumbers.length,
        status: 'active',
        startedAt: new Date()
      });
      
      console.log('Campaign created successfully:', createCampaign._id);

      // Create audience
      console.log('Creating audience for campaign:', createCampaign._id);
      await Audience.create({
        campaignId: createCampaign._id,
        phoneNumbers,
        totalCount: phoneNumbers.length,
        validCount: phoneNumbers.length
      });
      console.log('Audience created successfully');

      // Create message record
      console.log('Creating message record');
      await Message.create({
        CampaignName: campaignName,
        campaignId: createCampaign._id,
        userId,
        type,
        content,
        cost: totalCost,
        results: []
      });
      console.log('Message record created successfully');

      // Deduct wallet immediately
      await User.findByIdAndUpdate(userId, {
        $inc: { Wallet: -totalCost },
      });

      // Get token
      const token = await fetchJioToken(userId);

      // Respond immediately
      res.status(200).send({
        success: true,
        message: "Campaign started successfully",
        campaignId: createCampaign._id,
        totalNumbers: phoneNumbers.length,
      });

      // Background processing
      setImmediate(async () => {
        await sendMessagesInBatches(
          phoneNumbers,
          content,
          token,
          type,
          userId,
          sendJioSms,
          campaignName,
          createCampaign._id
        );
        await processRetryQueue(userId, sendJioSms);
      });
    } catch (err) {
      console.error(err);
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  }
};

export default SendMessageController;
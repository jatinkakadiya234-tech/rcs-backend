


import User from "../../User/models/UserModel.js";
import { CampaignModel, MessageModel } from "../../Message/index.js";
import { fetchJioToken } from "../../User/controllers/UserController.js";
import * as uuid from "uuid";
import axios from "axios";
import https from "https";

const uuidv4 = uuid.v4;

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 100,
});

const sendJioSms = async (phoneNumber, content, token, type, retries = 2) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let formattedPhone = phoneNumber.toString().replace(/[^0-9]/g, "");

      if (!formattedPhone.startsWith("91")) {
        formattedPhone = "91" + formattedPhone;
      }

      formattedPhone = "+" + formattedPhone;

      const messageId = `msg_${uuidv4()}`;

      const url = `https://api.businessmessaging.jio.com/v1/messaging/users/${formattedPhone}/assistantMessages/async?messageId=${messageId}`;

      const response = await axios.post(
        url,
        {
          botId: process.env.JIO_ASSISTANT_ID,
          content,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
          httpsAgent,
        }
      );

      return {
        phone: formattedPhone,
        status: response.status,
        messageId,
        result: "SUCCESS",
        type,
        attempt: attempt + 1,
        timestamp: new Date(),
      };
    } catch (error) {
      if (attempt === retries) {
        return {
          phone: phoneNumber,
          status: error.response?.status || 500,
          result: "FAILED",
          error: error.response?.data || error.message,
          attempt: attempt + 1,
          timestamp: new Date(),
        };
      }

      await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
    }
  }
};

const SendMessageController = {
  sendMessage: async (req, res) => {
    const { sendMessagesInBatches } = await import("../../utils/batchSender.js");
    const { processRetryQueue } = await import("../../utils/retryQueue.js");
    
    try {
      const { type, content, phoneNumbers=[], userId, campaignName, templateId } = req.body;

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
      
      const createCampaign = await CampaignModel.create({
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

      // Create message record
      console.log('Creating message record');
      await MessageModel.create({
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
          campaignName
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
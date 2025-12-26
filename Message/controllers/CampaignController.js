import CampaignModel from "../models/CampaignModel.js";
import MessageDetailModel from "../models/MessageDetailModel.js";


const CampaignController = {
  getAllCampaigns: async (req, res) => {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const campaigns = await CampaignModel.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await CampaignModel.countDocuments({ userId });

      res.status(200).send({
        campaigns,
        total,
        page: Number(page),
        pages: Math.ceil(total / limit),
      });
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
  },

  getCampaignById: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const campaign = await CampaignModel.findOne({ _id: id, userId });
      if (!campaign) {
        return res.status(404).send({ message: "Campaign not found" });
      }

      res.status(200).send({ campaign });
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
  },

  getCampaignMessages: async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const messages = await MessageDetailModel.find({ campaignId: id })
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await MessageDetailModel.countDocuments({ campaignId: id });

      res.status(200).send({
        messages,
        total,
        page: Number(page),
        pages: Math.ceil(total / limit),
      });
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
  },

  deleteCampaign: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const campaign = await CampaignModel.findOneAndDelete({ _id: id, userId });
      if (!campaign) {
        return res.status(404).send({ message: "Campaign not found" });
      }

      await MessageDetailModel.deleteMany({ campaignId: id });

      res.status(200).send({ message: "Campaign deleted" });
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
  },
};

export default CampaignController;

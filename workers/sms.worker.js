import Message from "../Message/MessageModel.js";
import pLimit from "p-limit";
import sendJioSms, { fetchJioToken } from "../User/UserController.js";

const CONCURRENCY = 100; // 🔥 Tune this (30–50 ideal)

const startSmsWorker = async (campaignId) => {
  try {
    console.log("========== Start Worker of JIO========== 1 =======");

    // Fetch campaign details
    const campaign = await Message.findById(campaignId);
    if (!campaign) return console.error("Campaign not found:", campaignId);

    const token = await fetchJioToken(campaign.userId);
    const limit = pLimit(CONCURRENCY);
    console.log("========== Start Worker of JIO========== 2 =======");

    const results = await Promise.allSettled(
      campaign.phoneNumbers.map((phone) =>
        limit(() => sendJioSms(phone, campaign.content, token, campaign.type))
      )
    );

    console.log("========== Start Worker of JIO========== 3 =======");

    const formattedResults = results.map((r) =>
      r.status === "fulfilled" ? r.value : { result: "FAILED" }
    );
    console.log("========== Start Worker of JIO========== 4 =======");

    const successCount = formattedResults.filter(
      (r) => r.result === "SUCCESS"
    ).length;
    const failedCount = formattedResults.length - successCount;

    console.log("========== Start Worker of JIO========== 5 =======");

    await Message.findByIdAndUpdate(campaignId, {
      results: formattedResults,
      status: "COMPLETED",
      successCount,
      failedCount,
      completedAt: new Date(),
    });

    console.log(`✅ Campaign ${campaignId} completed`);
  } catch (err) {
    console.error("Worker error:", err);
    await Message.findByIdAndUpdate(campaignId, {
      status: "FAILED",
    });
  }
};
export default startSmsWorker;

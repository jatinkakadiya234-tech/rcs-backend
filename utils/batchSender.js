import Message from "../Message/MessageModel.js";
import Result from "../models/ResultModel.js";
import { emitMessageUpdate } from "../socket.js";

export const sendMessagesInBatches = async (
  phoneNumbers,
  content,
  token,
  type,
  userId,
  sendJioSms,
  campaignName,
  campaignId
) => {
  const BATCH_SIZE = 100;
  const results = [];
  
  console.log(`🚀 Starting batch processing for ${phoneNumbers.length} numbers`);
  console.log(`📊 Total batches to process: ${Math.ceil(phoneNumbers.length / BATCH_SIZE)}`);

  for (let i = 0; i < phoneNumbers.length; i += BATCH_SIZE) {
    const batch = phoneNumbers.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    
    console.log(`📦 Processing batch ${batchNumber}/${Math.ceil(phoneNumbers.length / BATCH_SIZE)} - Numbers: ${i + 1} to ${Math.min(i + BATCH_SIZE, phoneNumbers.length)}`);
    
    const batchPromises = batch.map(async (phoneNumber, index) => {
      try {
        const result = await sendJioSms(phoneNumber, content, token, type);
        
        // Store in Result model
        await Result.create({
          campaignId,
          userId,
          phone: result.phone,
          messageId: result.messageId,
          status: result.error ? 'FAILED' : 'SENT',
          statusCode: result.status,
          timestamp: new Date(),
          response: result.response,
          error: result.error || false,
          errorMessage: result.error ? result.response?.error : null
        });
        
        if (index % 10 === 0) {
          console.log(`✅ Batch ${batchNumber}: Processed ${index + 1}/${batch.length} numbers`);
        }
        return result;
      } catch (error) {
        console.log(`❌ Error sending to ${phoneNumber}:`, error.message);
        
        // Store failed result
        await Result.create({
          campaignId,
          userId,
          phone: phoneNumber,
          messageId: `failed_${Date.now()}_${Math.random()}`,
          status: 'FAILED',
          statusCode: 500,
          timestamp: new Date(),
          error: true,
          errorMessage: error.message
        });
        
        return {
          phone: phoneNumber,
          status: 500,
          error: true,
          response: { error: error.message },
          timestamp: new Date().toISOString(),
          messaestatus: "SEND_MESSAGE_FAILURE"
        };
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);
    const processedResults = batchResults.map(result => 
      result.status === 'fulfilled' ? result.value : {
        phone: 'unknown',
        status: 500,
        error: true,
        response: { error: 'Promise rejected' },
        timestamp: new Date().toISOString(),
        messaestatus: "SEND_MESSAGE_FAILURE"
      }
    );

    results.push(...processedResults);
    
    const successCount = processedResults.filter(r => !r.error).length;
    const failCount = processedResults.filter(r => r.error).length;
    console.log(`📊 Batch ${batchNumber} completed: ${successCount} success, ${failCount} failed`);

    // Update message with batch results and counts
    const updatedMessage = await Message.findOneAndUpdate(
      { CampaignName: campaignName, userId },
      { 
        $push: { results: { $each: processedResults } },
        $inc: { 
          successCount: successCount,
          failedCount: failCount 
        }
      },
      { new: true }
    );
    
    // Get real-time stats from Result model
    const campaignStats = await Result.aggregate([
      { $match: { campaignId } },
      {
        $group: {
          _id: null,
          totalSent: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $eq: ["$status", "DELIVERED"] }, 1, 0] } },
          read: { $sum: { $cond: [{ $eq: ["$status", "READ"] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] } }
        }
      }
    ]);
    
    const stats = campaignStats[0] || { totalSent: 0, delivered: 0, read: 0, failed: 0 };
    
    // Emit real-time update
    emitMessageUpdate(userId, campaignName, {
      totalNumbers: phoneNumbers.length,
      totalSent: stats.totalSent,
      delivered: stats.delivered,
      read: stats.read,
      failed: stats.failed,
      batchNumber,
      totalBatches: Math.ceil(phoneNumbers.length / BATCH_SIZE)
    });
    
    console.log(`💾 Batch ${batchNumber} results saved to database`);

    // Small delay between batches
    if (i + BATCH_SIZE < phoneNumbers.length) {
      console.log(`⏳ Waiting 1 second before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  const totalSuccess = results.filter(r => !r.error).length;
  const totalFailed = results.filter(r => r.error).length;
  console.log(`🏁 All batches completed! Total: ${results.length}, Success: ${totalSuccess}, Failed: ${totalFailed}`);

  return results;
};
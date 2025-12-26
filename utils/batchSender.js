import Message from "../Message/models/MessageModel.js";
import { emitMessageUpdate, emitBatchProgress } from "../socket.js";

export const sendMessagesInBatches = async (
  phoneNumbers,
  content,
  token,
  type,
  userId,
  sendJioSms,
  campaignName
) => {
  const BATCH_SIZE = 100;
  const results = [];
  
  console.log(`🚀 Starting batch processing for ${phoneNumbers.length} numbers`);
  console.log(`📊 Total batches to process: ${Math.ceil(phoneNumbers.length / BATCH_SIZE)}`);

  for (let i = 0; i < phoneNumbers.length; i += BATCH_SIZE) {
    const batch = phoneNumbers.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    
    console.log(`📦 Processing batch ${batchNumber}/${Math.ceil(phoneNumbers.length / BATCH_SIZE)} - Numbers: ${i + 1} to ${Math.min(i + BATCH_SIZE, phoneNumbers.length)}`);
    
    // Emit batch start
    emitBatchProgress(userId, {
      batchNumber,
      totalBatches: Math.ceil(phoneNumbers.length / BATCH_SIZE),
      status: 'processing',
      processed: i,
      total: phoneNumbers.length
    });
    
    const batchPromises = batch.map(async (phoneNumber, index) => {
      try {
        const result = await sendJioSms(phoneNumber, content, token, type);
        if (index % 10 === 0) {
          console.log(`✅ Batch ${batchNumber}: Processed ${index + 1}/${batch.length} numbers`);
        }
        return result;
      } catch (error) {
        console.log(`❌ Error sending to ${phoneNumber}:`, error.message);
        return {
          phone: phoneNumber,
          status: 500,
          error: true,
          response: { error: error.message },
          createdAt: new Date().toISOString(),
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
        createdAt: new Date().toISOString(),
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
    
    // Emit real-time update
    emitMessageUpdate(userId, campaignName, {
      successCount: updatedMessage.successCount,
      failedCount: updatedMessage.failedCount,
      totalProcessed: updatedMessage.successCount + updatedMessage.failedCount,
      totalNumbers: phoneNumbers.length,
      batchNumber,
      totalBatches: Math.ceil(phoneNumbers.length / BATCH_SIZE)
    });
    
    // Emit batch completion
    emitBatchProgress(userId, {
      batchNumber,
      totalBatches: Math.ceil(phoneNumbers.length / BATCH_SIZE),
      status: 'completed',
      processed: i + batch.length,
      total: phoneNumbers.length,
      batchSuccess: successCount,
      batchFailed: failCount
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

  // Emit final completion
  emitBatchProgress(userId, {
    status: 'finished',
    processed: phoneNumbers.length,
    total: phoneNumbers.length,
    totalSuccess,
    totalFailed
  });

  return results;
};
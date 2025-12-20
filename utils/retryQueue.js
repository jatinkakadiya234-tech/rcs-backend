// Background Retry Queue System
const retryQueue = [];
let isProcessing = false;

const addToRetryQueue = (phoneNumber, content, token, type) => {
  retryQueue.push({
    phoneNumber,
    content,
    token,
    type,
    attempts: 0,
    addedAt: Date.now(),
  });
  console.log(`📥 Added to retry queue: ${phoneNumber} | Queue size: ${retryQueue.length}`);
};

const processRetryQueue = async (sendJioSms) => {
  if (isProcessing) {
    console.log("⏳ Queue already processing, skipping...");
    return;
  }
  
  if (retryQueue.length === 0) {
    console.log("✅ Retry queue is empty");
    return;
  }

  isProcessing = true;
  console.log(`🔄 Processing retry queue | Items: ${retryQueue.length}`);

  while (retryQueue.length > 0) {
    const item = retryQueue.shift();
    
    if (item.attempts >= 3) {
      console.log(`❌ Max retries reached for ${item.phoneNumber}, dropping...`);
      continue;
    }

    item.attempts++;
    console.log(`🔁 Retry attempt ${item.attempts}/3 for ${item.phoneNumber}`);
    
    try {
      const result = await sendJioSms(
        item.phoneNumber,
        item.content,
        item.token,
        item.type
      );

      if (result.status === 500) {
        console.log(`⚠️ Still failing (500), re-queuing ${item.phoneNumber}`);
        retryQueue.push(item);
      } else {
        console.log(`✅ Retry successful for ${item.phoneNumber}`);
      }
    } catch (error) {
      console.log(`❌ Retry error for ${item.phoneNumber}:`, error.message);
      if (item.attempts < 3) {
        retryQueue.push(item);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  isProcessing = false;
  console.log("✅ Queue processing completed");
};

export { addToRetryQueue, processRetryQueue };

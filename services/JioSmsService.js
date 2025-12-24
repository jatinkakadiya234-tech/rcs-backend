import axios from "axios";
import * as uuid from "uuid";
const uuidv4 = uuid.v4;

// --- Send SMS function ---
export const sendJioSms = async (phoneNumber, content, token, type, retries = 2) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let formattedPhone = phoneNumber
        .toString()
        .trim()
        .replace(/[^0-9+]/g, "");
      if (!formattedPhone.startsWith("+91"))
        formattedPhone = "+91" + formattedPhone.replace(/^0+/, "");

      const messageId = `msg_${uuidv4()}`;
      const url = `https://api.businessmessaging.jio.com/v1/messaging/users/${formattedPhone}/assistantMessages/async?messageId=${messageId}`;

      const payload = {
        botId: process.env.JIO_ASSISTANT_ID,
        content: content,
      };

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      });

      return {
        phone: formattedPhone,
        status: response.status,
        response: response.data,
        messageId,
        createdAt: new Date().toISOString(),
        result: "Message Sent Successfully",
        type: type,
        statusText: response.statusText,
        attempt: attempt + 1,
        messaestatus: "SEND_MESSAGE_SUCCESS"
      };
    } catch (error) {
      if (attempt === retries) {
        console.error(`❌ Final attempt failed for ${phoneNumber}:`, error.response?.data || error.message);
        return {
          phone: phoneNumber,
          status: error.response?.status || 500,
          response: { error: error.response?.data || error.message },
          error: true,
          createdAt: new Date().toISOString(),
          attempt: attempt + 1,
          messaestatus: "SEND_MESSAGE_FAILURE"
        };
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
};
import bcrypt from "bcrypt";
import axios from "axios";
import jwt from "jsonwebtoken";
import User from "./UserModel.js";
import WalletRequest from "./WalletRequestModel.js";
import * as uuid from "uuid";
const uuidv4 = uuid.v4;
import dotenv from "dotenv";
import cloudinary from "../utils/cloudinary.js";
import Message from "../Message/MessageModel.js";
import TransactionController from "../Transaction/TransactionController.js";
import Transaction from "../Transaction/TransactionModel.js";
import mongoose from "mongoose";
import fs from "fs";
import https from "https";
import startSmsWorker from "../workers/sms.worker.js";
import CampaignModel from "../Message/CampaignModel.js";
dotenv.config();

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 100,
});

// --- Token cache (per user) ---
let tokenCache = new Map(); // { userId: { token, expiry } }

// --- Fetch Jio OAuth Token with user credentials ---
export const fetchJioToken = async (userId) => {
  const now = Date.now();

  // Check if token exists in cache for this specific user
  if (tokenCache.has(userId)) {
    const cached = tokenCache.get(userId);
    if (now < cached.expiry) {
      console.log(`Using cached token for user ${userId}`);
      return cached.token;
    } else {
      // Remove expired token
      tokenCache.delete(userId);
    }
  }

  const user = await User.findById(userId);
  if (!user || !user.jioId || !user.jioSecret) {
    throw new Error("Jio credentials not found in user profile");
  }
  // console.log(user.jioId, user.jioSecret, "user jio credentials");
  // console.log(user);
  let jioid = user.jioId.toString().trim();
  let jiosecret = user.jioSecret.toString().trim();

  console.log(jioid, "jio id-------------");
  console.log(jiosecret, "jio secret-------------");

  const tokenUrl = `https://tgs.businessmessaging.jio.com/v1/oauth/token?grant_type=client_credentials&client_id=${jioid}&client_secret=${jiosecret}&scope=read`;

  const response = await axios.get(tokenUrl);

  const newToken = response.data.access_token;

  // console.log(response);

  // Store token in cache for this specific user with 1 hour expiry
  tokenCache.set(userId, {
    token: newToken,
    expiry: now + 60 * 60 * 1000, // 1 hour
  });

  return newToken;
};

// --- Check RCS capability for single number ---
const checkRcsCapability = async (phoneNumber, token) => {
  if (!phoneNumber || !token) return false;

  const formattedPhone = phoneNumber.startsWith("+")
    ? phoneNumber
    : `+91${phoneNumber}`;

  const url = `https://api.businessmessaging.jio.com/v1/messaging/users/${formattedPhone}/capabilities`;

  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });
    console.log("single number API");
    return res.data || false;
  } catch (err) {
    console.error(
      `RCS API error for ${phoneNumber}:`,
      err.response?.status || err.message
    );
    return false;
  }
};

// --- Check RCS capability for multiple numbers (bulk) ---
const checkBulkCapability = async (phoneNumbers, token) => {
  if (!phoneNumbers || !Array.isArray(phoneNumbers) || !token) {
    return null;
  }

  const url = `https://api.businessmessaging.jio.com/v1/messaging/usersBatchGet`;

  try {
    const res = await axios.post(
      url,
      {
        phoneNumbers,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );
    console.log("bulk API===================================", res);
    return res.data || null;
  } catch (error) {
    console.error(
      "Error in bulk check:",
      error.response?.data || error.message
    );
    return null;
  }
};


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



// --- Controller Object ---
const UserController = {
  registerUser: async (req, res) => {
    try {
      const { name, email, password, phone } = req.body;
      if (!name || !email || !password || !phone)
        return res.status(400).send({ message: "All fields are required" });

      const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
      if (existingUser)
        return res
          .status(400)
          .send({ message: "Email or Phone already exists" });

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await User.create({
        name,
        email,
        password: hashedPassword,
        phone,
      });

      res.status(201).send({
        message: "User registered successfully",
        user: newUser,
      });
    } catch (err) {
      res
        .status(500)
        .send({ message: "Internal server error", error: err.message });
    }
  },

  loginUser: async (req, res) => {
    try {
      const { emailorphone, password } = req.body;

      console.log(
        emailorphone,
        password,
        "--------req.body---------------------"
      );

      console.log("user ....................");

      if (!emailorphone)
        return res.status(404).send({ message: "email or phone is invailid" });
      if (!password)
        return res.status(404).send({ message: "password is invailid" });

      const query = /^\d+$/.test(emailorphone)
        ? { phone: Number(emailorphone) }
        : { email: emailorphone.toLowerCase() };

      const user = await User.findOne(query);
      if (!user)
        return res
          .status(400)
          .send({ message: "Invalid email or phone number" });

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid)
        return res.status(400).send({ message: "Invalid password" });

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user._id,
          email: user.email,
          role: user.role,
        },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "1d" }
      );

      // Set cookies with 1 day expiry
      res.cookie("jio_token", token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1 * 24 * 60 * 60 * 1000, // 1 day
      });

      res.cookie(
        "user_data",
        JSON.stringify({ ...user.toObject(), password: undefined }),
        {
          httpOnly: false,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 1 * 24 * 60 * 60 * 1000, // 1 day
        }
      );

      res.cookie("login_time", new Date().getTime().toString(), {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1 * 24 * 60 * 60 * 1000, // 1 day
      });

      res.status(200).send({
        message: "Login successful",
        user: { ...user.toObject(), password: undefined },
        token,
      });
    } catch (err) {
      res
        .status(500)
        .send({ message: "Internal server error", error: err.message });
    }
  },

  updateProfile: async (req, res) => {
    try {
      const { userId } = req.params;
      const { name, email, phone, companyname } = req.body;

      if (!userId) {
        return res
          .status(400)
          .send({ success: false, message: "User ID is required" });
      }

      const updateData = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (phone) updateData.phone = phone;
      if (companyname) updateData.companyname = companyname;

      const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
        new: true,
        select: "-password",
      });

      if (!updatedUser) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }

      res.status(200).send({
        success: true,
        message: "Profile updated successfully",
        user: updatedUser,
      });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // webhookReceiver: async (req, res) => {
  //   try {
  //     const webhookData = req.body;

  //     console.log(
  //       "📥 Jio Webhook Received:",
  //       JSON.stringify(webhookData, null, 2)
  //     );

  //     const eventType =
  //       webhookData?.entity?.eventType || webhookData?.entityType;
  //     const orgMsgId = webhookData?.metaData?.orgMsgId;
  //     const userPhoneNumber = webhookData?.userPhoneNumber;

  //     // For USER_MESSAGE, use orgMsgId to find original message
  //     if (eventType === "USER_MESSAGE" && orgMsgId) {
  //       const message = await Message.findOne({
  //         "results.messageId": orgMsgId,
  //       });

  //       if (message) {
  //         const resultIndex = message.results.findIndex(
  //           (r) => r.messageId === orgMsgId
  //         );
  //         if (resultIndex !== -1) {
  //           message.results[resultIndex].userReplay =
  //             webhookData?.entity?.text || null;
  //           message.results[resultIndex].entityType =
  //             webhookData?.entityType || null;

  //           // Increment reply count each time user replies
  //           message.results[resultIndex].replyCount =
  //             (message.results[resultIndex].replyCount || 0) + 1;

  //           // Handle suggestion response - track clicks
  //           if (webhookData?.entity?.suggestionResponse) {
  //             // Increment click count each time suggestion is clicked
  //             message.results[resultIndex].userCliked =
  //               (message.results[resultIndex].userCliked || 0) + 1;
  //             console.log(
  //               `🎯 Suggestion clicked ${message.results[resultIndex].userCliked} time(s)`
  //             );

  //             // Store the suggestion response
  //             if (
  //               !Array.isArray(message.results[resultIndex].suggestionResponse)
  //             ) {
  //               message.results[resultIndex].suggestionResponse = [];
  //             }
  //             message.results[resultIndex].suggestionResponse.push({
  //               ...webhookData?.entity?.suggestionResponse,
  //               clickedAt: new Date().toISOString(),
  //               clickNumber: message.results[resultIndex].userCliked,
  //             });
  //           }

  //           await message.save();
  //           console.log(
  //             `✅ User reply saved for message ${orgMsgId} from ${userPhoneNumber} (Reply #${message.results[resultIndex].replyCount})`
  //           );
  //         }
  //       }
  //     } else {
  //       // For other events, use entity.messageId
  //       const messageId = webhookData?.entity?.messageId;

  //       if (messageId) {
  //         const message = await Message.findOne({
  //           "results.messageId": messageId,
  //         });

  //         if (message) {
  //           const resultIndex = message.results.findIndex(
  //             (r) => r.messageId === messageId
  //           );
  //           if (resultIndex !== -1) {
  //             const oldStatus = message.results[resultIndex].messaestatus;
  //             message.results[resultIndex].messaestatus = eventType;
  //             message.results[resultIndex].error =
  //               webhookData?.entity?.error ||
  //               eventType === "SEND_MESSAGE_FAILURE";
  //             message.results[resultIndex].errorMessage =
  //               webhookData?.entity?.error?.message || null;

  //             // Track delivered count
  //             if (eventType === "MESSAGE_DELIVERED" && oldStatus !== "MESSAGE_DELIVERED") {
  //               message.results[resultIndex].deliveredCount =
  //                 (message.results[resultIndex].deliveredCount || 0) + 1;
  //             }

  //             // Track read count
  //             if (eventType === "MESSAGE_READ" && oldStatus !== "MESSAGE_READ") {
  //               message.results[resultIndex].readCount =
  //                 (message.results[resultIndex].readCount || 0) + 1;
  //             }

  //             // If message failed and wasn't already failed, refund user
  //             if (
  //               eventType === "SEND_MESSAGE_FAILURE" &&
  //               oldStatus !== "SEND_MESSAGE_FAILURE"
  //             ) {
  //               await User.findByIdAndUpdate(message.userId, {
  //                 $inc: { Wallet: 1 },
  //               });
  //               console.log(
  //                 `💰 Refunded ₹1 to user ${message.userId} for failed message ${messageId}`
  //               );
  //             }

  //             message.successCount = message.results.filter(
  //               (r) =>
  //                 r.messaestatus === "MESSAGE_DELIVERED" ||
  //                 r.messaestatus === "MESSAGE_READ" ||
  //                 r.messaestatus === "SEND_MESSAGE_SUCCESS"
  //             ).length;
  //             message.failedCount = message.results.filter(
  //               (r) => r.messaestatus === "SEND_MESSAGE_FAILURE"
  //             ).length;

  //             await message.save();
  //             console.log(
  //               `✅ Updated message ${messageId} with status: ${eventType}`
  //             );
  //           }
  //         }
  //       }
  //     }

  //     res.status(200).json({ success: true, message: "Webhook received" });
  //   } catch (error) {
  //     console.error("❌ Webhook Error:", error);
  //     res.status(500).json({ success: false, error: error.message });
  //   }
  // },



//   webhookReceiver: async (req, res) => {
//   try {
//     const webhookData = req.body;
//     const eventType = webhookData?.entity?.eventType || webhookData?.entityType;
//     const messageId = webhookData?.entity?.messageId || webhookData?.metaData?.orgMsgId;

//     if (!messageId) {
//       return res.status(200).json({ success: true, message: "No messageId" });
//     }

//     const MessageDetail = (await import("../Message/MessageDetailModel.js")).default;
    
//     const detail = await MessageDetail.findOne({ messageId });
//     if (!detail) {
//       return res.status(200).json({ success: true, message: "Message not found" });
//     }

//     if (eventType === "USER_MESSAGE") {
//       detail.userReply = (detail.userReply || 0) + 1;
//     } else if (webhookData?.entity?.suggestionResponse) {
//       detail.userClicked = (detail.userClicked || 0) + 1;
//       detail.suggestionResponse.push({
//         ...webhookData.entity.suggestionResponse,
//         clickedAt: new Date(),
//       });
//     }

//     detail.status = eventType;
//     detail.updatedAt = new Date();
//     await detail.save();

//     res.status(200).json({ success: true });
//   } catch (error) {
//     console.error("❌ Webhook Error:", error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// },


// webhookReceiver: async (req, res) => {
//   try {
//     const data = req.body;

//     console.log("📥 Jio Webhook Received:", JSON.stringify(data, null, 2));

//     // 🔹 Common fields
//     const eventType = data?.entity?.eventType || data?.entityType;
//     const orgMsgId = data?.metaData?.orgMsgId; // for USER_MESSAGE
//     const messageId = data?.entity?.messageId; // for delivery/read/fail
//     const userPhoneNumber = data?.userPhoneNumber;

//     /* =====================================================
//        🟢 CASE 1 : USER MESSAGE (User Reply / Button Click)
//     ====================================================== */
//     if (eventType === "USER_MESSAGE" && orgMsgId) {
//       const message = await Message.findOne({
//         "results.messageId": orgMsgId,
//       });

//       if (!message) {
//         return res.status(200).json({ success: true });
//       }

//       const index = message.results.findIndex(
//         (r) => r.messageId === orgMsgId
//       );
//       if (index === -1) {
//         return res.status(200).json({ success: true });
//       }

//       const result = message.results[index];

//       // ✍️ Save user reply text
//       result.userReplay = data?.entity?.text || null;
//       result.entityType = data?.entityType || null;

//       // 🔢 Reply count
//       result.replyCount = (result.replyCount || 0) + 1;

//       // 🎯 Suggestion / Button click
//       if (data?.entity?.suggestionResponse) {
//         result.userCliked = (result.userCliked || 0) + 1;

//         if (!Array.isArray(result.suggestionResponse)) {
//           result.suggestionResponse = [];
//         }

//         result.suggestionResponse.push({
//           ...data.entity.suggestionResponse,
//           clickedAt: new Date(),
//           clickNumber: result.userCliked,
//         });
//       }

//       await message.save();

//       console.log(
//         `✅ USER_MESSAGE saved | MsgId: ${orgMsgId} | Phone: ${userPhoneNumber}`
//       );

//       return res.status(200).json({ success: true });
//     }

//     /* =====================================================
//        🔵 CASE 2 : STATUS EVENTS (DELIVERED / READ / FAILED)
//     ====================================================== */
//     if (messageId) {
//       const message = await Message.findOne({
//         "results.messageId": messageId,
//       });

//       if (!message) {
//         return res.status(200).json({ success: true });
//       }

//       const index = message.results.findIndex(
//         (r) => r.messageId === messageId
//       );
//       if (index === -1) {
//         return res.status(200).json({ success: true });
//       }

//       const result = message.results[index];
//       const oldStatus = result.messaestatus;

//       // 🔄 Update status
//       result.messaestatus = eventType;
//       result.error = data?.entity?.error || false;
//       result.errorMessage = data?.entity?.error?.message || null;

//       // 📦 Delivered count
//       if (
//         eventType === "MESSAGE_DELIVERED" &&
//         oldStatus !== "MESSAGE_DELIVERED"
//       ) {
//         result.deliveredCount = (result.deliveredCount || 0) + 1;
//       }

//       // 👁 Read count
//       if (eventType === "MESSAGE_READ" && oldStatus !== "MESSAGE_READ") {
//         result.readCount = (result.readCount || 0) + 1;
//       }

//       // ❌ Failure → Refund wallet
//       if (
//         eventType === "SEND_MESSAGE_FAILURE" &&
//         oldStatus !== "SEND_MESSAGE_FAILURE"
//       ) {
//         await User.findByIdAndUpdate(message.userId, {
//           $inc: { Wallet: 1 },
//         });

//         console.log(`💰 Wallet refunded for message ${messageId}`);
//       }

//       // 📊 Recalculate success / failed
//       message.successCount = message.results.filter((r) =>
//         ["MESSAGE_DELIVERED", "MESSAGE_READ", "SEND_MESSAGE_SUCCESS"].includes(
//           r.messaestatus
//         )
//       ).length;

//       message.failedCount = message.results.filter(
//         (r) => r.messaestatus === "SEND_MESSAGE_FAILURE"
//       ).length;

//       await message.save();

//       console.log(`✅ Status updated | MsgId: ${messageId} → ${eventType}`);
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Webhook processed successfully",
//     });
//   } catch (error) {
//     console.error("❌ Webhook Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// },



webhookReceiver: async (req, res) => {
  try {
    const data = req.body;

    console.log("📥 Jio Webhook Received:", JSON.stringify(data, null, 2));

    // 🔹 Common fields
    const eventType = data?.entity?.eventType || data?.entityType;
    const orgMsgId = data?.metaData?.orgMsgId; // USER_MESSAGE
    const messageId = data?.entity?.messageId; // STATUS EVENTS
    const userPhoneNumber = data?.userPhoneNumber;

    /* =====================================================
       🟢 CASE 1 : USER MESSAGE (Reply / Button Click)
    ====================================================== */
    // if (eventType === "USER_MESSAGE" && orgMsgId) {
    //   const message = await Message.findOne({
    //     "results.messageId": orgMsgId,
    //   });

    //   if (!message) {
    //     return res.status(200).json({ success: true });
    //   }

    //  for (let index = 0; index < message.results.length; index++) {
    // if(message.results[index].suggestionResponse.length >=0 ){
    //      message.userClickCount = +1
    //     message.results[index].suggestionResponse = data?.entity?.suggestionResponse
    // }

    // message.userReplyCount = +1
    // message.results[index].suggestionResponse = data?.entity?.suggestionResponse
    //  }
     
  

    //   await message.save();

    //   console.log(
    //     `✅ USER_MESSAGE | MsgId: ${orgMsgId} | Phone: ${userPhoneNumber}`
    //   );

    //   return res.status(200).json({ success: true });
    // }
if (eventType === "USER_MESSAGE" && orgMsgId) {

  const message = await Message.findOne({
    "results.messageId": orgMsgId
  });

  if (!message) {
    return res.status(200).json({ success: true });
  }

  for (let index = 0; index < message.results.length; index++) {

    const result = message.results[index];

    // ✅ only matched message
    if (result.messageId === orgMsgId) {

      // 👉 suggestionResponse exists => CLICK
      if (
        Array.isArray(result.suggestionResponse) &&
        result.suggestionResponse.length > 0
      ) {
        message.userClickCount += 1;
      }

      // 👉 USER replied
      message.userReplyCount += 1;

      // 👉 store response
      result.suggestionResponse = data?.entity?.suggestionResponse || [];

      break; // 🔴 very important (extra loop stop)
    }
  }

  await message.save();

  console.log(
    `✅ USER_MESSAGE | MsgId: ${orgMsgId} | Phone: ${userPhoneNumber}`
  );

  return res.status(200).json({ success: true });
}

    /* =====================================================
       🔵 CASE 2 : STATUS EVENTS (DELIVERED / READ / FAILED)
    ====================================================== */
    if (messageId) {
      const message = await Message.findOne({
        "results.messageId": messageId,
      });

      if (!message) {
        return res.status(200).json({ success: true });
      }

      const index = message.results.findIndex(
        (r) => r.messageId === messageId
      );
      if (index === -1) {
        return res.status(200).json({ success: true });
      }

      const result = message.results[index];
      const oldStatus = result.messaestatus;

      // 🔄 Update status
      result.messaestatus = eventType;
      result.error = !!data?.entity?.error;
      result.errorMessage = data?.entity?.error?.message || null;

      /* ---------- 📦 DELIVERED ---------- */
      if (
        eventType === "MESSAGE_DELIVERED" &&
        oldStatus !== "MESSAGE_DELIVERED"
      ) {
        message.totalDelivered = (message.totalDelivered || 0) + 1;
      }

      /* ---------- 👁 READ ---------- */
      if (
        eventType === "MESSAGE_READ" &&
        oldStatus !== "MESSAGE_READ"
      ) {
        message.totalRead = (message.totalRead || 0) + 1;
      }

      /* ---------- ❌ FAILED ---------- */
      if (
        eventType === "SEND_MESSAGE_FAILURE" &&
        oldStatus !== "SEND_MESSAGE_FAILURE"
      ) {
        message.failedCount = (message.failedCount || 0) + 1;

        // 💰 Wallet refund
        await User.findByIdAndUpdate(message.userId, {
          $inc: { Wallet: 1 },
        });

        console.log(`💰 Wallet refunded | MsgId: ${messageId}`);
      }

      /* ---------- ✅ SUCCESS ---------- */
      if (
        ["MESSAGE_DELIVERED", "MESSAGE_READ", "SEND_MESSAGE_SUCCESS"].includes(
          eventType
        ) &&
        !["MESSAGE_DELIVERED", "MESSAGE_READ", "SEND_MESSAGE_SUCCESS"].includes(
          oldStatus
        )
      ) {
        message.successCount = (message.successCount || 0) + 1;
      }

      await message.save();

      console.log(
        `✅ STATUS UPDATED | MsgId: ${messageId} → ${eventType}`
      );
    }

    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
    });
  } catch (error) {
    console.error("❌ Webhook Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
},


  sendMessage: async (req, res) => {
    // const { sendMessagesInBatches } = await import("../utils/batchSender.js");
    // const { processRetryQueue } = await import("../utils/retryQueue.js");
    //----OLd code-----
    // try {
    //   const { type, content, phoneNumbers, userId, campaignName } = req.body

    //   console.log(req.body, "------request body data");

    //   if (!type || !content || !phoneNumbers || !userId || !campaignName) {
    //     return res
    //       .status(400)
    //       .send({ success: false, message: "Missing required fields" });
    //   }

    //   let allredyCampaign = await Message.findOne({
    //     CampaignName: campaignName,
    //     userId: userId,
    //   });

    //   if (allredyCampaign) {
    //     return res
    //       .status(400)
    //       .send({
    //         success: false,
    //         message:
    //           "Campaign name already exists. Please choose a different name.",
    //       });
    //   }

    //   // Check user wallet balance
    //   const user = await User.findById(userId);
    //   if (!user) {
    //     return res
    //       .status(404)
    //       .send({ success: false, message: "User not found" });
    //   }

    //   const phoneCount = phoneNumbers.length;
    //   const costPerPhone = 1;
    //   const totalCost = phoneCount * costPerPhone;

    //   if (user.Wallet < totalCost) {
    //     return res.status(400).send({
    //       success: false,
    //       message: "Insufficient balance",
    //       required: totalCost,
    //       available: user.Wallet,
    //     });
    //   }

    //   const token = await fetchJioToken(userId);

    //   // 🚀 Batch processing with 100 numbers per batch---

    //   const BATCH_SIZE = 100;
    //   const batches = [];

    //   for (let i = 0; i < phoneNumbers.length; i += BATCH_SIZE) {
    //     batches.push(phoneNumbers.slice(i, i + BATCH_SIZE));
    //   }

    //   let allResults = [];
    //   let processedCount = 0;

    //   // Process batches sequentially with delay------

    //   s
    //   for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    //     const batch = batches[batchIndex];

    //     // Send batch in parallel----

    //     const batchResults = await Promise.all(
    //       batch.map((phone) => sendJioSms(phone, content, token, type))
    //     );

    //     allResults = [...allResults, ...batchResults];
    //     processedCount += batch.length;

    //     console.log(`📤 Batch ${batchIndex + 1}/${batches.length} completed: ${batch.length} messages sent`);

    //     if (batchIndex < batches.length - 1) {
    //       await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    //     }
    //   }

    //   // Deduct wallet balance------

    //   await User.findByIdAndUpdate(userId, {
    //     $inc: { Wallet: -totalCost },
    //   });

    //   const messageData = new Message({
    //     type,
    //     content,
    //     phoneNumbers,
    //     results: allResults,
    //     userId,
    //     cost: totalCost,
    //     CampaignName: campaignName,
    //     batchInfo: {
    //       totalBatches: batches.length,
    //       batchSize: BATCH_SIZE,
    //       processedCount
    //     }
    //   });
    //   await messageData.save();

    //   const successCount = allResults.filter(r => r.status === 200 || r.status === 201).length;
    //   const failedCount = allResults.filter(r => r.error || r.status >= 400).length;

    //   return res.status(200).send({
    //     success: true,
    //     message: `Messages sent in ${batches.length} batches of ${BATCH_SIZE}`,
    //     data: {
    //       campaignId: messageData._id,
    //       totalNumbers: phoneCount,
    //       successCount,
    //       failedCount,
    //       batchInfo: {
    //         totalBatches: batches.length,
    //         batchSize: BATCH_SIZE
    //       }
    //     },
    //     walletDeducted: totalCost,
    //   });
    // } catch (err) {
    //   res.status(500).send({
    //     success: false,
    //     message: "Internal server error",
    //     error: err.message,
    //   });
    // }

    //----New code-----
    try {
      const { type, content, phoneNumbers, userId, campaignName,templateId } = req.body;
      
      console.log( req.body, '-----------');

      if (
        !type ||
        !content ||
        !phoneNumbers?.length ||
        !userId ||
        !campaignName|| 
        !templateId
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


 const createCamian = await CampaignModel.create({
        campaignName,
        templateId,
        userId,
        type,
        content,
        audienceCount: phoneNumbers.length,
      })

if(createCamian) return res.status(200).send({
        success: true,
        message: "Campaign created successfully",
        campaignId: createCamian._id,
        totalNumbers: phoneNumbers.length,
      })
      // Check user-----------

    
      const totalCost = phoneNumbers.length * 1;

      if (user.Wallet < totalCost) {
        return res.status(400).send({
          success: false,
          message: "Insufficient balance",
          required: totalCost,
          available: user.Wallet,
        });
      }

      // Deduct wallet immediately-------------

      await User.findByIdAndUpdate(userId, {
        $inc: { Wallet: -totalCost },
      });

     

  
      // 🔥 Respond immediately---------------

      res.status(200).send({
        success: true,
        message: "Campaign started successfully",
        campaignId: campaign._id,
        totalNumbers: phoneNumbers.length,
      });

      // 🚀 Background processing-------------

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
  },

  checkAvablityNumber: async (req, res) => {
    try {
      let { phoneNumbers, userId } = req.body;

      if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0)
        return res
          .status(400)
          .send({ success: false, message: "phoneNumbers array required" });

      if (!userId)
        return res
          .status(400)
          .send({ success: false, message: "userId required" });

      const originalCount = phoneNumbers.length;
      phoneNumbers = [...new Set(phoneNumbers)];
      const duplicatesRemoved = originalCount - phoneNumbers.length;

      const jioToken = await fetchJioToken(userId);

      if (phoneNumbers.length < 500) {
        const results = await Promise.all(
          phoneNumbers.map((phone) => checkRcsCapability(phone, jioToken))
        );

        const reachableUsers = phoneNumbers.filter(
          (phone, index) => results[index]
        );

        return res.status(200).send({
          success: true,
          rcsMessaging: {
            reachableUsers,
            totalRandomSampleUserCount: phoneNumbers.length,
            reachableRandomSampleUserCount: reachableUsers.length,
          },
          duplicatesRemoved,
        });
      }

      // Bulk API with 10,000 limit
      const BATCH_SIZE = 10000;
      let allReachableUsers = [];

      for (let i = 0; i < phoneNumbers.length; i += BATCH_SIZE) {
        const batch = phoneNumbers.slice(i, i + BATCH_SIZE);
        const bulkResults = await checkBulkCapability(batch, jioToken);
        
        if (bulkResults?.reachableUsers) {
          allReachableUsers.push(...bulkResults.reachableUsers);
        }
      }

      return res.status(200).send({
        success: true,
        rcsMessaging: {
          reachableUsers: allReachableUsers,
          totalRandomSampleUserCount: phoneNumbers.length,
          reachableRandomSampleUserCount: allReachableUsers.length,
        },
        duplicatesRemoved,
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  uploadImage: async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .send({ success: false, message: "No image file provided" });
      }

      let result = await cloudinary.uploader.upload(req.file.path, {
        folder: "rcs",
      });

      await fs.unlinkSync(req.file.path);

      res.status(200).send({
        success: true,
        message: "Image uploaded successfully",
        url: result.secure_url,
        public_id: result.public_id,
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Image upload failed",
        error: err.message,
      });
    }
  },

  requestWalletRecharge: async (req, res) => {
    try {
      const { amount, userId } = req.body;
      if (!amount || !userId) {
        return res
          .status(400)
          .send({ success: false, message: "Amount and userId required" });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }

      const walletRequest = new WalletRequest({
        userId,
        amount,
      });

      await walletRequest.save();
      res.status(201).send({
        success: true,
        message: "Wallet recharge request submitted",
        data: walletRequest,
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  getAllUsers: async (req, res) => {
    try {
      const users = await User.find({ role: { $ne: "admin" } }, "-password");
      res.status(200).send({ success: true, users });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  getWalletRequests: async (req, res) => {
    try {
      const requests = await WalletRequest.find()
        .populate("userId", "name email phone")
        .populate("processedBy", "name email")
        .sort({ requestedAt: -1 });
      res.status(200).send({ success: true, requests });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  approveWalletRequest: async (req, res) => {
    try {
      const { requestId } = req.params;
      const { adminId, note } = req.body || {};
      console.log(req.body, "request body data");
      console.log(req.params, "params data");

      if (!requestId || !adminId) {
        return res
          .status(400)
          .send({ success: false, message: "Missing required fields" });
      }
      if (!note) {
        return res
          .status(400)
          .send({ success: false, message: "Note is required" });
      }

      const request = await WalletRequest.findById(requestId);
      if (!request) {
        return res
          .status(404)
          .send({ success: false, message: "Request not found" });
      }

      if (request.status !== "pending") {
        return res
          .status(400)
          .send({ success: false, message: "Request already processed" });
      }

      await User.findByIdAndUpdate(request.userId, {
        $inc: { Wallet: request.amount },
      });

      // Create transaction record
      await TransactionController.createTransaction(
        request.userId,
        "credit",
        request.amount,
        `Wallet recharge approved - ₹${request.amount}`,
        "wallet_request",
        requestId
      );

      request.status = "approved";
      request.processedAt = new Date();
      request.processedBy = adminId;
      request.note = note;
      await request.save();

      res.status(200).send({
        success: true,
        message: "Wallet request approved",
        data: request,
      });
    } catch (err) {
      res
        .status(500)
        .send({ message: "Internal server error", error: err.message });
    }
  },

  rejectWalletRequest: async (req, res) => {
    try {
      const { requestId, adminId, note } = req.body;

      if (!requestId || !adminId) {
        return res
          .status(400)
          .send({ success: false, message: "Missing required fields" });
      }

      const request = await WalletRequest.findById(requestId);
      if (!request) {
        return res
          .status(404)
          .send({ success: false, message: "Request not found" });
      }

      if (request.status !== "pending") {
        return res
          .status(400)
          .send({ success: false, message: "Request already processed" });
      }

      request.status = "rejected";
      request.processedAt = new Date();
      request.processedBy = adminId;
      request.note = note;
      await request.save();

      res.status(200).send({
        success: true,
        message: "Wallet request rejected",
        data: request,
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  createUser: async (req, res) => {
    try {
      const {
        name,
        email,
        password,
        phone,
        role,
        jioId,
        jioSecret,
        companyname,
      } = req.body;

      if (!name || !email || !password || !phone || !companyname) {
        return res
          .status(400)
          .send({ success: false, message: "All fields are required" });
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid email format" });
      }

      // Phone validation (10 digits)
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(phone.toString())) {
        return res
          .status(400)
          .send({ success: false, message: "Phone must be 10 digits" });
      }

      // Password validation (minimum 6 characters)
      if (password.length < 6) {
        return res.status(400).send({
          success: false,
          message: "Password must be at least 6 characters",
        });
      }

      const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
      if (existingUser) {
        return res
          .status(400)
          .send({ success: false, message: "Email or Phone already exists" });
      }

      if (jioId && !jioSecret) {
        return res.status(400).send({
          success: false,
          message: "Jio Secret is required when Jio ID is provided",
        });
      }
      if (!companyname) {
        return res
          .status(400)
          .send({ success: false, message: "Company Name is required" });
      }
      if (!role) {
        return res
          .status(400)
          .send({ success: false, message: "Role is required" });
      }
      if (!password) {
        return res
          .status(400)
          .send({ success: false, message: "Password is required" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await User.create({
        name,
        email,
        password: hashedPassword,
        phone,
        role: role || "user",
        jioId,
        jioSecret,
        companyname,
      });

      res.status(201).send({
        success: true,
        message: "User created successfully",
        user: { ...newUser.toObject(), password: undefined },
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  getUserProfile: async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId, "-password");
      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }
      res.status(200).send({ success: true, user });
    } catch (err) {
      res
        .status(500)
        .send({ message: "Internal server error", error: err.message });
    }
  },

  getUserProfileWithTransactions: async (req, res) => {
    try {
      const { userId } = req.params;
      const { limit = 10 } = req.query;

      const user = await User.findById(userId, "-password");
      if (!user) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }

      const recentTransactions = await Transaction.find({ userId })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit));

      const totalCredit = await Transaction.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            type: "credit",
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      const totalDebit = await Transaction.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            type: "debit",
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      const profile = {
        user,
        transactionSummary: {
          totalCredit: totalCredit[0]?.total || 0,
          totalDebit: totalDebit[0]?.total || 0,
          currentBalance: user.Wallet,
        },
        recentTransactions,
      };

      res.status(200).send({ success: true, profile });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  getUserMessages: async (req, res) => {
    try {
      const { userId } = req.params;
      const messages = await Message.find({ userId }).sort({ createdAt: -1 });
      res.status(200).send({ success: true, messages });
    } catch (err) {
      res
        .status(500)
        .send({ message: "Internal server error", error: err.message });
    }
  },

  logoutUser: async (req, res) => {
    try {
      res.clearCookie("jio_token");
      res.clearCookie("user_data");
      res.clearCookie("login_time");
      res.status(200).send({
        success: true,
        message: "Logout successful",
      });
    } catch (err) {
      res
        .status(500)
        .send({ message: "Internal server error", error: err.message });
    }
  },

  getUserReports: async (req, res) => {
    try {
      const { userId } = req.params;
      const messages = await Message.find({ userId }).sort({ createdAt: -1 });

      const stats = {
        totalMessages: messages.length,
        successfulMessages: messages.filter((m) =>
          m.results?.some((r) => r.status === 200 || r.status === 201)
        ).length,
        failedMessages: messages.filter((m) => m.results?.some((r) => r.error))
          .length,
        messagesByType: messages.reduce((acc, msg) => {
          const existing = acc.find((item) => item._id === msg.type);
          if (existing) existing.count++;
          else acc.push({ _id: msg.type, count: 1 });
          return acc;
        }, []),
        recentMessages: messages.slice(0, 10),
      };

      res.status(200).send({ success: true, stats, messages });
    } catch (err) {
      res
        .status(500)
        .send({ message: "Internal server error", error: err.message });
    }
  },

  getTodayMessages: async (req, res) => {
    try {
      const { userId } = req.params;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const messages = await Message.find({
        userId,
        createdAt: {
          $gte: today,
          $lt: tomorrow,
        },
      }).sort({ createdAt: -1 });

      res.status(200).send({ success: true, messages });
    } catch (err) {
      res
        .status(500)
        .send({ message: "Internal server error", error: err.message });
    }
  },

  editUser: async (req, res) => {
    try {
      const { userId } = req.params;
      const updateData = req.body;

      delete updateData.password;

      const user = await User.findByIdAndUpdate(userId, updateData, {
        new: true,
      }).select("-password");
      if (!user) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }

      res
        .status(200)
        .send({ success: true, message: "User updated successfully", user });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  addWalletBalance: async (req, res) => {
    try {
      const { userId } = req.params;
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res
          .status(400)
          .send({ success: false, message: "Valid amount required" });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { Wallet: amount } },
        { new: true }
      ).select("-password");

      if (!user) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }

      // Create transaction record
      await TransactionController.createTransaction(
        userId,
        "credit",
        amount,
        `Admin added ₹${amount} to wallet`,
        "admin_add"
      );

      res.status(200).send({
        success: true,
        message: `₹${amount} added to wallet successfully`,
        user,
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  getUserById: async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId).select("-password");
      if (!user) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }
      res.status(200).send({ success: true, user });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  deleteUser: async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findByIdAndDelete(userId);
      if (!user) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }
      res
        .status(200)
        .send({ success: true, message: "User deleted successfully" });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  updateUserStatus: async (req, res) => {
    try {
      const { userId } = req.params;
      const { status } = req.body;

      if (!status || !["active", "inactive"].includes(status)) {
        return res.status(400).send({
          success: false,
          message: "Valid status required (active/inactive)",
        });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { status },
        { new: true }
      ).select("-password");

      if (!user) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }

      res.status(200).send({
        success: true,
        message: `User status updated to ${status}`,
        user,
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  resetUserPassword: async (req, res) => {
    try {
      const { userId } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).send({
          success: false,
          message: "Password must be at least 6 characters",
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const user = await User.findByIdAndUpdate(
        userId,
        { password: hashedPassword },
        { new: true }
      ).select("-password");

      if (!user) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }

      res
        .status(200)
        .send({ success: true, message: "Password reset successfully", user });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  getUserStats: async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId).select("-password");
      if (!user) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }

      const messages = await Message.find({ userId });
      const totalMessages = messages.length;
      const totalSpent = messages.reduce(
        (sum, msg) => sum + (msg.cost || 0),
        0
      );
      const successfulMessages = messages.filter((m) =>
        m.results?.some((r) => r.status === 200 || r.status === 201)
      ).length;
      const failedMessages = messages.filter((m) =>
        m.results?.some((r) => r.error)
      ).length;

      const stats = {
        user,
        totalMessages,
        totalSpent,
        successfulMessages,
        failedMessages,
        walletBalance: user.Wallet,
      };

      res.status(200).send({ success: true, stats });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  getAllUserMessages: async (req, res) => {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const messages = await Message.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Message.countDocuments({ userId });

      res.status(200).send({
        success: true,
        messages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  deductWalletBalance: async (req, res) => {
    try {
      const { userId } = req.params;
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res
          .status(400)
          .send({ success: false, message: "Valid amount required" });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }

      if (user.Wallet < amount) {
        return res
          .status(400)
          .send({ success: false, message: "Insufficient wallet balance" });
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $inc: { Wallet: -amount } },
        { new: true }
      ).select("-password");

      // Create transaction record
      await TransactionController.createTransaction(
        userId,
        "debit",
        amount,
        `Admin deducted ₹${amount} from wallet`,
        "admin_deduct"
      );

      res.status(200).send({
        success: true,
        message: `₹${amount} deducted from wallet successfully`,
        user: updatedUser,
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  deleteWalletRequest: async (req, res) => {
    try {
      const { requestId } = req.params;

      const request = await WalletRequest.findByIdAndDelete(requestId);
      if (!request) {
        return res
          .status(404)
          .send({ success: false, message: "Wallet request not found" });
      }

      res.status(200).send({
        success: true,
        message: "Wallet request deleted successfully",
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  getUserOrderHistory: async (req, res) => {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const user = await User.findById(userId).select(
        "name email phone Wallet"
      );
      if (!user) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }

      // Optimized query - select only required fields
      const messages = await Message.find({ userId })
        .select(
          "_id type CampaignName cost successCount failedCount createdAt phoneNumbers"
        )
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean(); // Use lean() for better performance

      const total = await Message.countDocuments({ userId });

      const orderHistory = {
        user: {
          name: user.name,
          email: user.email,
          phone: user.phone,
          currentBalance: user.Wallet,
        },
        orders: messages.map((msg) => ({
          _id: msg._id,
          type: msg.type,
          CampaignName: msg.CampaignName,
          cost: msg.cost,
          successCount: msg.successCount || 0,
          failedCount: msg.failedCount || 0,
          totalNumbers: msg.phoneNumbers?.length || 0,
          createdAt: msg.createdAt,
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      };

      res.status(200).send({ success: true, orderHistory });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },

  getAdminDashboard: async (req, res) => {
    try {
      // Recent Users (last 5)
      let recentUsers = await User.find({ role: { $ne: "admin" } })
        .select("-password")
        .sort({ createdAt: -1 })
        .limit(5);

      // Recent Wallet Requests (last 5)
      let recentWalletRequests = await WalletRequest.find()
        .populate("userId", "name email")
        .sort({ requestedAt: -1 })
        .limit(5);

      // Recent Transactions (last 5)
      let recentTransactions = await Transaction.find()
        .populate("userId", "name email")
        .sort({ createdAt: -1 })
        .limit(5);

      // Dashboard Stats
      const totalUsers =
        (await User.countDocuments({ role: { $ne: "admin" } })) || 5;
      const totalMessages = (await Message.countDocuments()) || 25;
      const pendingRequests =
        (await WalletRequest.countDocuments({ status: "pending" })) || 5;
      const totalTransactions = (await Transaction.countDocuments()) || 15;

      const dashboard = {
        stats: {
          totalUsers,
          totalMessages,
          pendingRequests,
          totalTransactions,
        },
        recentUsers,
        recentWalletRequests,
        recentTransactions,
      };

      res.status(200).send({ success: true, dashboard });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  },
};

export default UserController;

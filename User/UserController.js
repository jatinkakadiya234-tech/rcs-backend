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
dotenv.config();

// --- Token cache ---
let cachedJioToken = null;
let tokenExpiry = null;

// --- Fetch Jio OAuth Token with user credentials ---
const fetchJioToken = async (userId) => {
  const now = Date.now();
  if (cachedJioToken && tokenExpiry && now < tokenExpiry) return cachedJioToken;
 
  const user = await User.findById(userId);
  if (!user || !user.jioId || !user.jioSecret) {
    throw new Error('Jio credentials not found in user profile');
  }

  const tokenUrl = `https://tgs.businessmessaging.jio.com/v1/oauth/token?grant_type=client_credentials&client_id=${user.jioId}&client_secret=${user.jioSecret}&scope=read`;

  const response = await axios.get(tokenUrl);
  const newToken = response.data.access_token;

  cachedJioToken = newToken;
  tokenExpiry = now + 60 * 60 * 1000; // 1 hour
  return newToken;
};

// --- Check RCS capability ---
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
    return res.data || false;
  } catch (err) {
    console.error(
      `RCS API error for ${phoneNumber}:`,
      err.response?.status || err.message
    );
    return false;
  }
};

// --- ✅ Send Plain Text SMS (as per Jio v1.8) ---
const sendJioSms = async (phoneNumber, content, token, type) => {
  try {
    // 🧹 Format phone number
    let formattedPhone = phoneNumber
      .toString()
      .trim()
      .replace(/[^0-9+]/g, "");
    if (!formattedPhone.startsWith("+91"))
      formattedPhone = "+91" + formattedPhone.replace(/^0+/, "");

    const messageId = `msg_${uuidv4()}`;
    const url = `https://api.businessmessaging.jio.com/v1/messaging/users/${formattedPhone}/assistantMessages/async?messageId=${messageId}`;

    // ✅ Official payload structure (from Jio docs)
    const payload = {
      botId: process.env.JIO_ASSISTANT_ID,
      content: content,
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    return {
      phone: formattedPhone,
      status: response.status,
      response: response.data,
      messageId,
      timestamp: new Date().toISOString(),
      result: "Message Sent Successfully",
      type: type,
      statusText: response.statusText,
      _eventsCount: response.headers["x-events-count"] || null,
      _messageStatus: response.headers["x-message-status"] || null,
    };
  } catch (error) {
    console.error("❌ Jio API Error:", error.response?.data || error.message);
    return {
      phone: phoneNumber,
      status: error.response?.status || 500,
      response: { error: error.response?.data || error.message },
      error: true,
      timestamp: new Date().toISOString(),
    };
  }
};

// const sendRcsRichCard = async ({
//   imageUrl,
//   title,
//   subtitle,
//   phoneNumbers,
//   callUrl,
//   jioToken,
//   type,
// }) => {
//   const results = [];
//   await Promise.all(
//     phoneNumbers.map(async (phone) => {
//       const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;
//       const messageId = uuidv4();

//       const url = `https://api.businessmessaging.jio.com/v1/messaging/users/${formattedPhone}/assistantMessages/async?messageId=${messageId}`;

//       // const payload = {
//       //   content: {
//       //     richCardDetails: {
//       //       Standalone: {
//       //         cardOrientation: "VERTICAL",
//       //         content: {
//       //           cardTitle: title,
//       //           cardDescription: subtitle,
//       //           cardMedia: {
//       //             mediaHeight: "MEDIUM",
//       //             contentInfo: {
//       //               fileUrl: imageUrl,
//       //               thumbnailUrl: imageUrl,
//       //             },
//       //           },
//       //           suggestions: [
//       //             {
//       //               Action: {
//       //                 plainText: "Visit Website 🌐",
//       //                 postback: { data: "visit_site" },
//       //                 openUrl: { url: callUrl },
//       //               },
//       //             },
//       //             {
//       //               Action: {
//       //                 plainText: "Call Us 📞",
//       //                 postback: { data: "call_support" },
//       //                 dialerAction: { phoneNumber: "+919999999999" },
//       //               },
//       //             },
//       //             {
//       //               Reply: {
//       //                 plainText: "Stop",
//       //                 postback: { data: "stop_msg" },
//       //               },
//       //             },
//       //           ],
//       //         },
//       //       },
//       //     },
//       //   },
//       // };

//       if (type === "carousel") {
//         const payload = {
//           content: {
//             richCardDetails: {
//               carousel: {
//                 cardWidth: "MEDIUM_WIDTH",
//                 contents: [
//                   {
//                     cardTitle: "Explore the web securely",
//                     cardDescription:
//                       "Loaded with features like AdBlocker, Multiple search engines & VPN for Indians",
//                     cardMedia: {
//                       contentInfo: {
//                         fileUrl:
//                           "https://jfxv.akamaized.net/JBMCampaigns/JioSphere/Creatives/Camp1/caro1_card1.jpg",
//                       },
//                       mediaHeight: "MEDIUM",
//                     },
//                     suggestions: [
//                       {
//                         action: {
//                           plainText: "Browse Now",
//                           postBack: {
//                             data: "SA1L1C1",
//                           },
//                           openUrl: {
//                             url: "https://jiosphere.page.link/creative1",
//                           },
//                         },
//                       },
//                     ],
//                   },
//                   {
//                     cardTitle: "Entertainment on tap",
//                     cardDescription:
//                       "Enjoy tailored content in your language across various topics",
//                     cardMedia: {
//                       contentInfo: {
//                         fileUrl:
//                           "https://jfxv.akamaized.net/JBMCampaigns/JioSphere/Creatives/Camp1/caro1_card2.jpg",
//                       },
//                       mediaHeight: "MEDIUM",
//                     },
//                     suggestions: [
//                       {
//                         action: {
//                           plainText: "Download Now",
//                           postBack: {
//                             data: "SA2L1C2",
//                           },
//                           openUrl: {
//                             url: "https://jiosphere.page.link/Creative2",
//                           },
//                         },
//                       },
//                     ],
//                   },
//                   {
//                     cardTitle: "Your digital privacy matters",
//                     cardDescription:
//                       "Anti-tracking mode stops websites from tracking you",
//                     cardMedia: {
//                       contentInfo: {
//                         fileUrl:
//                           "https://jfxv.akamaized.net/JBMCampaigns/JioSphere/Creatives/Camp1/caro1_card3.jpg",
//                       },
//                       mediaHeight: "MEDIUM",
//                     },
//                     suggestions: [
//                       {
//                         action: {
//                           plainText: "Browse Privately",
//                           postBack: {
//                             data: "SA3L1C3",
//                           },
//                           openUrl: {
//                             url: "https://jiosphere.page.link/Creative3",
//                           },
//                         },
//                       },
//                     ],
//                   },
//                 ],
//               },
//             },
//             suggestions: [
//               {
//                 reply: {
//                   plainText: "Know More",
//                   postBack: {
//                     data: "SR1L1C0",
//                   },
//                 },
//               },
//             ],
//           },
//         };
//         try {
//           const resp = await axios.post(url, payload, {
//             headers: {
//               Authorization: `Bearer ${jioToken}`,
//               "Content-Type": "application/json",
//             },
//           });

//           results.push({
//             phone: formattedPhone,
//             status: resp.status,
//           });
//         } catch (err) {
//           results.push({
//             phone: formattedPhone,
//             status: err.response?.status || 500,
//             response: err.response?.data || err.message,
//           });
//         }
//       } else if (type === "VERTICAL") {
//         const payload = {
//           content: {
//             richCardDetails: {
//               standalone: {
//                 cardOrientation: "VERTICAL",
//                 content: {
//                   cardTitle: title,
//                   cardDescription: subtitle,
//                   cardMedia: {
//                     mediaHeight: "TALL",
//                     contentInfo: {
//                       fileUrl: imageUrl,
//                     },
//                   },
//                   suggestions: [
//                     {
//                       reply: {
//                         plainText: "Suggestion #1",
//                         postBack: {
//                           data: "suggestion_1",
//                         },
//                       },
//                     },
//                     {
//                       Action: {
//                         plainText: "Call Us 📞",
//                         postback: { data: "call_support" },
//                         dialerAction: { phoneNumber: callUrl },
//                       },
//                     },
//                   ],
//                 },
//               },
//             },
//           },
//         };
//         try {
//           const resp = await axios.post(url, payload, {
//             headers: {
//               Authorization: `Bearer ${jioToken}`,
//               "Content-Type": "application/json",
//             },
//           });

//           results.push({
//             phone: formattedPhone,
//             status: resp.status,
//           });
//         } catch (err) {
//           results.push({
//             phone: formattedPhone,
//             status: err.response?.status || 500,
//             response: err.response?.data || err.message,
//           });
//         }
//       } else if (type === "rcs") {
//         const payload = {
//           content: {
//             richCardDetails: {
//               standalone: {
//                 cardOrientation: "VERTICAL",
//                 content: {
//                   cardTitle: "This is card title",
//                   cardDescription: "This is card description",
//                   cardMedia: {
//                     mediaHeight: "TALL",
//                     contentInfo: {
//                       fileUrl:
//                         "http://www.google.com/logos/doodles/2015/googles-new-logo-5078286822539264.3-hp2x.gif",
//                     },
//                   },
//                   suggestions: [
//                     {
//                       reply: {
//                         plainText: "Suggestion #1",
//                         postBack: {
//                           data: "suggestion_1",
//                         },
//                       },
//                     },
//                     {
//                       reply: {
//                         plainText: "Suggestion #2",
//                         postBack: {
//                           data: "suggestion_2",
//                         },
//                       },
//                     },
//                   ],
//                 },
//               },
//             },
//           },
//         };
//         try {
//           const resp = await axios.post(url, payload, {
//             headers: {
//               Authorization: `Bearer ${jioToken}`,
//               "Content-Type": "application/json",
//             },
//           });

//           results.push({
//             phone: formattedPhone,
//             status: resp.status,
//           });
//         } catch (err) {
//           results.push({
//             phone: formattedPhone,
//             status: err.response?.status || 500,
//             response: err.response?.data || err.message,
//           });
//         }
//       } else if (type === "interactive") {
//         const payload = {};
//         try {
//           const resp = await axios.post(url, payload, {
//             headers: {
//               Authorization: `Bearer ${jioToken}`,
//               "Content-Type": "application/json",
//             },
//           });

//           results.push({
//             phone: formattedPhone,
//             status: resp.status,
//           });
//         } catch (err) {
//           results.push({
//             phone: formattedPhone,
//             status: err.response?.status || 500,
//             response: err.response?.data || err.message,
//           });
//         }
//       } else if (type === "button") {
//         const payload = {
//           content: {
//             plainText: "Visit this URL to find more about Jiosphere",
//             suggestions: [
//               {
//                 action: {
//                   plainText: "Browse Now",
//                   postBack: {
//                     data: "SA1L1C1",
//                   },
//                   openUrl: {
//                     url: "https://medium.com/hprog99/mastering-generics-in-go-a-comprehensive-guide-4d05ec4b12b",
//                     application: "WEBVIEW",
//                     webviewViewMode: "TALL",
//                     description: "its a link",
//                   },
//                 },
//               },
//             ],
//           },
//         };
//         try {
//           const resp = await axios.post(url, payload, {
//             headers: {
//               Authorization: `Bearer ${jioToken}`,
//               "Content-Type": "application/json",
//             },
//           });

//           results.push({
//             phone: formattedPhone,
//             status: resp.status,
//           });
//         } catch (err) {
//           results.push({
//             phone: formattedPhone,
//             status: err.response?.status || 500,
//             response: err.response?.data || err.message,
//           });
//         }
//       } else {
//         const payload = {};
//         try {
//           const resp = await axios.post(url, payload, {
//             headers: {
//               Authorization: `Bearer ${jioToken}`,
//               "Content-Type": "application/json",
//             },
//           });

//           results.push({
//             phone: formattedPhone,
//             status: resp.status,
//           });
//         } catch (err) {
//           results.push({
//             phone: formattedPhone,
//             status: err.response?.status || 500,
//             response: err.response?.data || err.message,
//           });
//         }
//       }

//       try {
//         const resp = await axios.post(url, payload, {
//           headers: {
//             Authorization: `Bearer ${jioToken}`,
//             "Content-Type": "application/json",
//           },
//         });

//         results.push({
//           phone: formattedPhone,
//           status: resp.status,
//         });
//       } catch (err) {
//         results.push({
//           phone: formattedPhone,
//           status: err.response?.status || 500,
//           response: err.response?.data || err.message,
//         });
//       }
//     })
//   );

//   return results;
// };

// const carasolmesage = async ({ phoneNumbers, jioToken ,}) => {
//    try {
//     // 🧹 Format phone number
//     let formattedPhone = phoneNumber
//       .toString()
//       .trim()
//       .replace(/[^0-9+]/g, "");
//     if (!formattedPhone.startsWith("+91"))
//       formattedPhone = "+91" + formattedPhone.replace(/^0+/, "");

//     const messageId = `msg_${uuidv4()}`;
//     const url = `https://api.businessmessaging.jio.com/v1/messaging/users/${formattedPhone}/assistantMessages/async?messageId=${messageId}`;

//     // ✅ Official payload structure (from Jio docs)
//     const payload = {
//       botId: process.env.JIO_ASSISTANT_ID,
//       content: content
//     };

//     const response = await axios.post(url, payload, {
//       headers: {
//         Authorization: `Bearer ${token}`,
//         "Content-Type": "application/json",
//       },
//       timeout: 10000,
//     });

//     console.log("📩 Jio Response:", response);

//     return {
//       phone: formattedPhone,
//       status: response.status,
//       response: response.data,
//       messageId,
//       timestamp: new Date().toISOString(),
//       result: "Message Sent Successfully",
//       type: "text",
//       statusText: response.statusText,
//       _eventsCount:response.headers['x-events-count'] || null,
//       _messageStatus:response.headers['x-message-status'] || null,

//     };
//   } catch (error) {
//     console.error("❌ Jio API Error:", error.response?.data || error.message);
//     return {
//       phone: phoneNumber,
//       status: error.response?.status || 500,
//       response: { error: error.response?.data || error.message },
//       error: true,
//       timestamp: new Date().toISOString(),
//     };
//   }
// }

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

      console.log(emailorphone, password , '--------req.body---------------------');

      console.log("user ....................");

      if(!emailorphone) return res.status(404).send({message:"email or phone is invailid"})
      if(!password) return res.status(404).send({message:"password is invailid"})

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
          role: user.role 
        },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "1d" }
      );

      // Set cookies with 1 day expiry
      res.cookie("jio_token", token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1 * 24 * 60 * 60 * 1000 // 1 day
      });

      res.cookie("user_data", JSON.stringify({ ...user.toObject(), password: undefined }), {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1 * 24 * 60 * 60 * 1000 // 1 day
      });

      res.cookie("login_time", new Date().getTime().toString(), {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1 * 24 * 60 * 60 * 1000 // 1 day
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

  // sendNormalSms: async (req, res) => {
  //   try {
  //     const { title, phoneNumbers, tableName, campaignName } = req.body;
  //     if (!title || !Array.isArray(phoneNumbers))
  //       return res
  //         .status(400)
  //         .send({ message: "Title and phoneNumbers required" });

  //     const token = await fetchJioToken();
  //     const results = await Promise.all(
  //       phoneNumbers.map((phone) =>
  //         sendJioSms(phone, title, token, tableName, campaignName)
  //       )
  //     );

  //     res.status(200).send({ message: "SMS sending completed", results });
  //   } catch (err) {
  //     res
  //       .status(500)
  //       .send({ message: "Internal server error", error: err.message });
  //   }
  // },

  sendMessage: async (req, res) => {
    try {
      const { type, content, phoneNumbers, userId, campaignName } = req.body;
      
      if (!type || !content || !phoneNumbers || !userId || !campaignName) {
        return res.status(400).send({ success: false, message: "Missing required fields" });
      }
      
      // Check user wallet balance
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).send({ success: false, message: "User not found" });
      }
      
      const phoneCount = phoneNumbers.length;
      const costPerPhone = 1; // ₹1 per phone number
      const totalCost = phoneCount * costPerPhone;
      
      if (user.Wallet < totalCost) {
        return res.status(400).send({ 
          success: false, 
          message: "Insufficient balance",
          required: totalCost,
          available: user.Wallet
        });
      }
    
      const token = await fetchJioToken(userId);
      if (type === "text") {
        let results = await Promise.all(
          phoneNumbers.map((phone) => sendJioSms(phone, content, token, type))
        );
        
        // Deduct wallet balance
        await User.findByIdAndUpdate(userId, {
          $inc: { Wallet: -totalCost }
        });
        
        const messageData = new Message({
          type,
          content,
          phoneNumbers,
          results,
          userId,
          cost: totalCost,
          CampaignName: campaignName
        });
        await messageData.save();
        
        return res.status(200).send({ 
          success: true,
          message: "Text message sent", 
          data: messageData,
          results,
          walletDeducted: totalCost
        });
      } else if (type === "carousel") {
        let results = await Promise.all(
          phoneNumbers.map((phone) => sendJioSms(phone, content, token, type))
        );
        
        await User.findByIdAndUpdate(userId, {
          $inc: { Wallet: -totalCost }
        });
        
        const messageData = new Message({
          type,
          content,
          phoneNumbers,
          results,
          userId,
          cost: totalCost,
          CampaignName: campaignName
        });
        await messageData.save();
        
        return res.status(200).send({ 
          success: true,
          message: "Text message sent", 
          data: messageData,
          results,
          walletDeducted: totalCost
        });
      } else if (type === "text-with-action") {
        let results = await Promise.all(
          phoneNumbers.map((phone) => sendJioSms(phone, content, token, type))
        );
        
        await User.findByIdAndUpdate(userId, {
          $inc: { Wallet: -totalCost }
        });
        
         const messageData = new Message({
          type,
          content,
          phoneNumbers,
          results,
          userId,
          cost: totalCost,
          CampaignName: campaignName
        });
        await messageData.save();
        
        return res.status(200).send({ 
          success: true,
          message: "Text message sent", 
          data: messageData,
          results,
          walletDeducted: totalCost
        });
      } else if (type === "rcs") {
        let results = await Promise.all(
          phoneNumbers.map((phone) => sendJioSms(phone, content, token, type))
        );
        
        await User.findByIdAndUpdate(userId, {
          $inc: { Wallet: -totalCost }
        });
        
        const messageData = new Message({
          type,
          content,
          phoneNumbers,
          results,
          userId,
          cost: totalCost,
          CampaignName: campaignName
        });
        await messageData.save();
        
        return res.status(200).send({ 
          success: true,
          message: "RCS message sent", 
          data: messageData,
          results,
          walletDeducted: totalCost
        });
      } else if (type === "suggestion") {
        let results = await Promise.all(
          phoneNumbers.map((phone) => sendJioSms(phone, content, token, type))
        );
        
        await User.findByIdAndUpdate(userId, {
          $inc: { Wallet: -totalCost }
        });
        
        const messageData = new Message({
          type,
          content,
          phoneNumbers,
          results,
          userId,
          cost: totalCost,
          CampaignName: campaignName
        });
        await messageData.save();
        
        return res.status(200).send({ 
          success: true,
          message: "Suggestion message sent", 
          data: messageData,
          results,
          walletDeducted: totalCost
        });
      } else if (type === "webview") {
        let results = await Promise.all(
          phoneNumbers.map((phone) => sendJioSms(phone, content, token, type))
        );
        
        await User.findByIdAndUpdate(userId, {
          $inc: { Wallet: -totalCost }
        });
        
        const messageData = new Message({
          type,
          content,
          phoneNumbers,
          results,
          userId,
          cost: totalCost,
          CampaignName: campaignName
        });
        await messageData.save();
        
        return res.status(200).send({ 
          success: true,
          message: "Webview message sent", 
          data: messageData,
          results,
          walletDeducted: totalCost
        });
      } else if (type === "dialer-action") {
        let results = await Promise.all(
          phoneNumbers.map((phone) => sendJioSms(phone, content, token, type))
        );
        
        await User.findByIdAndUpdate(userId, {
          $inc: { Wallet: -totalCost }
        });
        
        const messageData = new Message({
          type,
          content,
          phoneNumbers,
          results,
          userId,
          cost: totalCost,
          CampaignName: campaignName
        });
        await messageData.save();
        
        return res.status(200).send({ 
          success: true,
          message: "Dialer action message sent", 
          data: messageData,
          results,
          walletDeducted: totalCost
        });
      }
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  checkAvablityNumber: async (req, res) => {
    try {
      const { phoneNumbers  } = req.body;
      if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0)
        return res.status(400).send({ success: false, message: "phoneNumbers array required" });

      // Get userId from request (you'll need to add auth middleware)
      const { userId } = req.body; // or get from auth middleware
      console.log("userId:", userId);
      const jioToken = await fetchJioToken(userId);
      const results = {};
      for (const phone of phoneNumbers) {
        results[phone] = await checkRcsCapability(phone, jioToken);
      }

      res.status(200).send({ success: true, rcsMessaging: results });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  uploadImage: async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).send({ success: false, message: "No image file provided" });
      }

      let result = await cloudinary.uploader.upload(req.file.path, {
        folder: "rcs",
      })

      res.status(200).send({
        success: true,
        message: "Image uploaded successfully",
        url: result.secure_url,
        public_id: result.public_id
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: "Image upload failed",
        error: err.message
      });
    }
  },

  requestWalletRecharge: async (req, res) => {
    try {
      const { amount, userId } = req.body;
      if (!amount || !userId) {
        return res.status(400).send({ success: false, message: "Amount and userId required" });
      }
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).send({ success: false, message: "User not found" });
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
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  getAllUsers: async (req, res) => {
    try {
      const users = await User.find({ role: { $ne: "admin" } }, "-password");
      res.status(200).send({ success: true, users });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
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
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  approveWalletRequest: async (req, res) => {
    try {
      const { requestId } = req.params;
      const { adminId, note } = req.body || {};
      console.log(req.body, "request body data");
      console.log(req.params,"params data");
      
      if (!requestId || !adminId) {
        return res.status(400).send({ success: false, message: "Missing required fields" });
      }
      
      const request = await WalletRequest.findById(requestId);
      if (!request) {
        return res.status(404).send({ success: false, message: "Request not found" });
      }

      if (request.status !== "pending") {
        return res.status(400).send({ success: false, message: "Request already processed" });
      }

      await User.findByIdAndUpdate(request.userId, {
        $inc: { Wallet: request.amount }
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
      res.status(500).send({ message: "Internal server error", error: err.message });
    }
  },

  rejectWalletRequest: async (req, res) => {
    try {
      const { requestId, adminId, note } = req.body;
      
      if (!requestId || !adminId) {
        return res.status(400).send({ success: false, message: "Missing required fields" });
      }
      
      const request = await WalletRequest.findById(requestId);
      if (!request) {
        return res.status(404).send({ success: false, message: "Request not found" });
      }

      if (request.status !== "pending") {
        return res.status(400).send({ success: false, message: "Request already processed" });
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
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  createUser: async (req, res) => {
    try {
      const { name, email, password, phone, role , jioId, jioSecret,companyname } = req.body;
      if (!name || !email || !password || !phone || !companyname) {
        return res.status(400).send({ message: "All fields are required" });
      }

      const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
      if (existingUser) {
        return res.status(400).send({ message: "Email or Phone already exists" });
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
        companyname
      });

      res.status(201).send({
        success: true,
        message: "User created successfully",
        user: { ...newUser.toObject(), password: undefined },
      });
    } catch (err) {
      res.status(500).send({ message: "Internal server error", error: err.message });
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
      res.status(500).send({ message: "Internal server error", error: err.message });
    }
  },

  getUserProfileWithTransactions: async (req, res) => {
    try {
      const { userId } = req.params;
      const { limit = 10 } = req.query;
      
      const user = await User.findById(userId, "-password");
      if (!user) {
        return res.status(404).send({ success: false, message: "User not found" });
      }
      
      const recentTransactions = await Transaction.find({ userId })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit));
      
      const totalCredit = await Transaction.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId), type: "credit" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]);
      
      const totalDebit = await Transaction.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId), type: "debit" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]);
      
      const profile = {
        user,
        transactionSummary: {
          totalCredit: totalCredit[0]?.total || 0,
          totalDebit: totalDebit[0]?.total || 0,
          currentBalance: user.Wallet
        },
        recentTransactions
      };
      
      res.status(200).send({ success: true, profile });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  getUserMessages: async (req, res) => {
    try {
      const { userId } = req.params;
      const messages = await Message.find({ userId }).sort({ createdAt: -1 });
      res.status(200).send({ success: true, messages });
    } catch (err) {
      res.status(500).send({ message: "Internal server error", error: err.message });
    }
  },

  logoutUser: async (req, res) => {
    try {
      res.clearCookie("jio_token");
      res.clearCookie("user_data");
      res.clearCookie("login_time");
      res.status(200).send({
        success: true,
        message: "Logout successful"
      });
    } catch (err) {
      res.status(500).send({ message: "Internal server error", error: err.message });
    }
  },

  getUserReports: async (req, res) => {
    try {
      const { userId } = req.params;
      const messages = await Message.find({ userId }).sort({ createdAt: -1 });
      
      const stats = {
        totalMessages: messages.length,
        successfulMessages: messages.filter(m => m.results?.some(r => r.status === 200 || r.status === 201)).length,
        failedMessages: messages.filter(m => m.results?.some(r => r.error)).length,
        messagesByType: messages.reduce((acc, msg) => {
          const existing = acc.find(item => item._id === msg.type);
          if (existing) existing.count++;
          else acc.push({ _id: msg.type, count: 1 });
          return acc;
        }, []),
        recentMessages: messages.slice(0, 10)
      };
      
      res.status(200).send({ success: true, stats, messages });
    } catch (err) {
      res.status(500).send({ message: "Internal server error", error: err.message });
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
          $lt: tomorrow
        }
      }).sort({ createdAt: -1 });
      
      res.status(200).send({ success: true, messages });
    } catch (err) {
      res.status(500).send({ message: "Internal server error", error: err.message });
    }
  },

  editUser: async (req, res) => {
    try {
      const { userId } = req.params;
      const updateData = req.body;
      
      delete updateData.password;
      
      const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select("-password");
      if (!user) {
        return res.status(404).send({ success: false, message: "User not found" });
      }
      
      res.status(200).send({ success: true, message: "User updated successfully", user });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  addWalletBalance: async (req, res) => {
    try {
      const { userId } = req.params;
      const { amount } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).send({ success: false, message: "Valid amount required" });
      }
      
      const user = await User.findByIdAndUpdate(
        userId, 
        { $inc: { Wallet: amount } }, 
        { new: true }
      ).select("-password");
      
      if (!user) {
        return res.status(404).send({ success: false, message: "User not found" });
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
        user 
      });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  getUserById: async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId).select("-password");
      if (!user) {
        return res.status(404).send({ success: false, message: "User not found" });
      }
      res.status(200).send({ success: true, user });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  deleteUser: async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findByIdAndDelete(userId);
      if (!user) {
        return res.status(404).send({ success: false, message: "User not found" });
      }
      res.status(200).send({ success: true, message: "User deleted successfully" });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  updateUserStatus: async (req, res) => {
    try {
      const { userId } = req.params;
      const { status } = req.body;
      
      if (!status || !["active", "inactive"].includes(status)) {
        return res.status(400).send({ success: false, message: "Valid status required (active/inactive)" });
      }
      
      const user = await User.findByIdAndUpdate(
        userId, 
        { status }, 
        { new: true }
      ).select("-password");
      
      if (!user) {
        return res.status(404).send({ success: false, message: "User not found" });
      }
      
      res.status(200).send({ success: true, message: `User status updated to ${status}`, user });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  resetUserPassword: async (req, res) => {
    try {
      const { userId } = req.params;
      const { newPassword } = req.body;
      
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).send({ success: false, message: "Password must be at least 6 characters" });
      }
      
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const user = await User.findByIdAndUpdate(
        userId, 
        { password: hashedPassword }, 
        { new: true }
      ).select("-password");
      
      if (!user) {
        return res.status(404).send({ success: false, message: "User not found" });
      }
      
      res.status(200).send({ success: true, message: "Password reset successfully", user });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  getUserStats: async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId).select("-password");
      if (!user) {
        return res.status(404).send({ success: false, message: "User not found" });
      }
      
      const messages = await Message.find({ userId });
      const totalMessages = messages.length;
      const totalSpent = messages.reduce((sum, msg) => sum + (msg.cost || 0), 0);
      const successfulMessages = messages.filter(m => m.results?.some(r => r.status === 200 || r.status === 201)).length;
      const failedMessages = messages.filter(m => m.results?.some(r => r.error)).length;
      
      const stats = {
        user,
        totalMessages,
        totalSpent,
        successfulMessages,
        failedMessages,
        walletBalance: user.Wallet
      };
      
      res.status(200).send({ success: true, stats });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
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
          pages: Math.ceil(total / limit)
        }
      });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  deductWalletBalance: async (req, res) => {
    try {
      const { userId } = req.params;
      const { amount } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).send({ success: false, message: "Valid amount required" });
      }
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).send({ success: false, message: "User not found" });
      }
      
      if (user.Wallet < amount) {
        return res.status(400).send({ success: false, message: "Insufficient wallet balance" });
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
        user: updatedUser 
      });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  deleteWalletRequest: async (req, res) => {
    try {
      const { requestId } = req.params;
      
      const request = await WalletRequest.findByIdAndDelete(requestId);
      if (!request) {
        return res.status(404).send({ success: false, message: "Wallet request not found" });
      }
      
      res.status(200).send({ 
        success: true, 
        message: "Wallet request deleted successfully" 
      });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },

  getUserOrderHistory: async (req, res) => {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 20 } = req.query;
      
      const user = await User.findById(userId).select("-password");
      if (!user) {
        return res.status(404).send({ success: false, message: "User not found" });
      }
      
      const messages = await Message.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
        
      const total = await Message.countDocuments({ userId });
      
      const orderHistory = {
        user: {
          name: user.name,
          email: user.email,
          phone: user.phone,
          currentBalance: user.Wallet
        },
        orders: messages.map(msg => ({
          _id: msg._id,
          type: msg.type,
          CampaignName: msg.CampaignName,
          phoneNumbers: msg.phoneNumbers,
          cost: msg.cost,
          successCount: msg.results?.filter(r => r.status === 200 || r.status === 201).length || 0,
          failedCount: msg.results?.filter(r => r.error || r.status >= 400).length || 0,
          totalNumbers: msg.phoneNumbers?.length || 0,
          createdAt: msg.createdAt
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };
      
      res.status(200).send({ success: true, orderHistory });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
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
      const totalUsers = await User.countDocuments({ role: { $ne: "admin" } }) || 5;
      const totalMessages = await Message.countDocuments() || 25;
      const pendingRequests = await WalletRequest.countDocuments({ status: "pending" }) || 5;
      const totalTransactions = await Transaction.countDocuments() || 15;
      
      const dashboard = {
        stats: {
          totalUsers,
          totalMessages,
          pendingRequests,
          totalTransactions
        },
        recentUsers,
        recentWalletRequests,
        recentTransactions
      };
      
      res.status(200).send({ success: true, dashboard });
    } catch (err) {
      res.status(500).send({ success: false, message: "Internal server error", error: err.message });
    }
  },
};

export default UserController;

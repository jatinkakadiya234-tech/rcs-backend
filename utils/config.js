import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  jioClientId: process.env.JIO_CLIENT_ID,
  jioClientSecret: process.env.JIO_CLIENT_SECRET,
  jioAgentId: process.env.JIO_AGENT_ID,
  jioBrandId: process.env.JIO_BRAND_ID,
};

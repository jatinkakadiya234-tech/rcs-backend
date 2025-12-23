import axios from "axios";
import User from "../User/UserModel.js";

// --- Token cache (per user) ---
let tokenCache = new Map();

// --- Fetch Jio OAuth Token with user credentials ---
export const fetchJioToken = async (userId) => {
  const now = Date.now();

  if (tokenCache.has(userId)) {
    const cached = tokenCache.get(userId);
    if (now < cached.expiry) {
      console.log(`Using cached token for user ${userId}`);
      return cached.token;
    } else {
      tokenCache.delete(userId);
    }
  }

  const user = await User.findById(userId);
  if (!user || !user.jioId || !user.jioSecret) {
    throw new Error("Jio credentials not found in user profile");
  }

  let jioid = user.jioId.toString().trim();
  let jiosecret = user.jioSecret.toString().trim();

  const tokenUrl = `https://tgs.businessmessaging.jio.com/v1/oauth/token?grant_type=client_credentials&client_id=${jioid}&client_secret=${jiosecret}&scope=read`;

  const response = await axios.get(tokenUrl);
  const newToken = response.data.access_token;

  tokenCache.set(userId, {
    token: newToken,
    expiry: now + 60 * 60 * 1000, // 1 hour
  });

  return newToken;
};
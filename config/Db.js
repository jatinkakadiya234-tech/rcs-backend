import mongoose from "mongoose";

import dotenv from "dotenv";
dotenv.config();
async function ConnectDB() {
  try {
    await mongoose.connect(process.env.DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Database connected successfully");
  } catch (error) { 
    console.error("Database connection error:", error);
  } 
}

export default ConnectDB;
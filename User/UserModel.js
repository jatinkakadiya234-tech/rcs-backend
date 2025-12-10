import e from "express";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Name is required"],
    trim: true,
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
  },
  password: {
    type: String,
    required: [true, "Password is required"],
  },
  phone: {
    type: Number,
    required: [true, "Phone number is required"],
    unique: true,
    match: [/^\d{10}$/, "Invalid phone number format"],
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },
  Wallet: {
    type: Number,
    default: 0,
  },
  jioId:{
    type:String,
    default:null
  },
  jioSecret:{
    type:String,
    default:null
  },
  status:{
    type:String,
    enum: ["active", "inactive"],
    default: "active"

  }
  

});


const User = mongoose.model("User", userSchema);
export default User;

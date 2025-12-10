import User from "../User/UserModel.js";
import jwt from "jsonwebtoken";
import Dotenv from "dotenv";
Dotenv.config();

export const adminOnly = async (req, res, next) => {
  try {
    const token = req.cookies.token; 

    if (!token) {
      return res.status(401).send({ message: "Authorization token required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "scsajnsldsndjsakdjsakd");

    const user = await User.findById(decoded.userId);
    if (!user || user.role !== "admin") {
      return res.status(403).send({ message: "Admin access required" });
    }

    req.user = user;
    next();

  
  } catch (error) {
    res
      .status(500)
      .send({ message: "Authorization error", error: error.message });
  }
};

export const checkActive = async (req, res, next) => {
  try {
    const token = req.cookies.token; 
    if (!token) {
      return res.status(401).send({ message: "Authorization token required" });
    }
console.log();
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");

    const user = await User.findById(decoded.userId);
    if (!user || user.status !== "active") {
      return res.status(403).send({ message: "User is not active" });
    }

    req.user = user;
    next();
  } catch (error) {
    res
      .status(500)
      .send({ message: "Authorization error", error: error.message });
  }
};
export const findjioId = async (req,res,next) => {
 try {
    const token = req?.cookies?.jio_token;
    console.log(token);
    if (!token) {
      return res.status(401).send({ message: "Authorization token required" });
    }
    const decoded = await jwt.verify(token, process.env.JWT_SECRET || "scsajnsldsndjsakdjsakd");
    console.logs(decoded,"dssdscsdcscds");
    const user = await User.findById(decoded.userId);
    if (!user || !user.jioId || !user.jioSecret) {
      return res.status(403).send({ message: "Jio credentials not found" });
    }
    req.user = user;
    next();

 } catch (error) {
  res
      .status(500)
      .send({ message: "Authorization error", error: error.message });
 }
}
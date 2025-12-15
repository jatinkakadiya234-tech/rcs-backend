import expess from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import ConnectDB from "./config/Db.js";
import userRouter from "./User/UserRouter.js";
import cors from "cors";
import TemplateRoute from "./Tamplete/TampleteRoute.js";
import MessageApiRoute from "./Message/MessageRoute.js";
import TransactionRoute from "./Transaction/TransactionRoute.js";

dotenv.config();

const app = expess();
ConnectDB();
app.use(cors({
  origin: ["http://localhost:5173","https://rcssender.com" ,"*"],
  credentials: true,
}));
app.use(cookieParser());
app.use(expess.json({ limit: "100mb" }));
app.use(expess.urlencoded({ extended: true, limit: "100mb" }));

// JSON parsing for routes (excluding file upload)
app.use("/api", (req, res, next) => {
  if (req.path === "/uploadFile") {
    return next();
  }
  next();
});
 app.get("/api/v1",(req,res)=>{
  res.send("API is running...");
 });



app.use("/api", userRouter);
app.use("/api/v1/templates", TemplateRoute);
app.use("/api/v1/message-reports", MessageApiRoute);
app.use("/api/v1/transactions", TransactionRoute);
app.post("/api/jio/rcs/webhook", (req, res) => {
  console.log("HEADERS:", req.headers);
  console.log("BODY:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});


const PORT = process.env.PORT || 8888;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

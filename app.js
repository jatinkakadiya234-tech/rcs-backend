import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import morgan from "morgan";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { initSocket } from "./socket.js";

// Routes
import ConnectDB from "./config/Db.js";
import { UserRouter } from "./User/index.js";
import { TemplateRouter } from "./Tamplete/index.js";
import { MessageRouter } from "./Message/index.js";
import { TransactionRouter } from "./Transaction/index.js";
import { SendMessageRouter } from "./SendMessage/index.js";

dotenv.config();

// 🔹 ESM compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// 🔹 Initialize Socket.IO
initSocket(server);

// 🔹 Database Connection
ConnectDB();

// 🔹 CORS Configuration
app.use(
  cors({
    origin: ["http://localhost:5174", "https://rcssender.com","*"],
    credentials: true,
  })
);

// 🔹 Middlewares
app.use(cookieParser());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// 🔹 Morgan Logger (access.log)-----------
// const accessLogStream = fs.createWriteStream(
//   path.join(__dirname, "access.log"),
//   { flags: "a" }
// );
// app.use(morgan("combined", { stream: accessLogStream }));

app.use(morgan("dev"));

// 🔹 Health Check
app.get("/api/v1", (req, res) => {
  res.send("✅ API is running...");
});

// 🔹 Routes
app.use("/api", UserRouter);
app.use("/api/v1/templates", TemplateRouter);
app.use("/api/v1/message-reports", MessageRouter);
app.use("/api/v1/transactions", TransactionRouter);
app.use("/api/v1/send-message", SendMessageRouter);

// 🔹 Server Start
const PORT = process?.env?.PORT || 8880;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

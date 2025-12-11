import  exxpress  from "express";
import UserController from "./UserController.js";
import upload from "../middleware/multerConfig.js";

const userRouter = exxpress.Router();

userRouter.post("/register", UserController.registerUser);
userRouter.post("/login", UserController.loginUser);
userRouter.post("/logout", UserController.logoutUser);
userRouter.post("/sendMessage", UserController.sendMessage);
userRouter.post("/checkAvablityNumber",UserController.checkAvablityNumber);
userRouter.post("/uploadFile", upload.single('file'), UserController.uploadImage);

// User Profile API
userRouter.get("/profile/:userId", UserController.getUserProfile);
userRouter.get("/messages/:userId", UserController.getUserMessages);
userRouter.get("/messages/today/:userId", UserController.getTodayMessages);

// Wallet APIs
userRouter.post("/wallet/request", UserController.requestWalletRecharge);

// Admin APIs (Protected)
userRouter.get("/admin/users", UserController.getAllUsers);
userRouter.get("/admin/wallet-requests", UserController.getWalletRequests);
userRouter.post("/admin/wallet/approve", UserController.approveWalletRequest);
userRouter.post("/admin/wallet/reject", UserController.rejectWalletRequest);
userRouter.post("/admin/create-user", UserController.createUser);
userRouter.get("/admin/user-reports/:userId", UserController.getUserReports);



export default userRouter;
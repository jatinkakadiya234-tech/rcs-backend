import  exxpress  from "express";
import UserController from "./UserController.js";
import upload from "../middleware/multerConfig.js";

const userRouter = exxpress.Router();

userRouter.post("/register", UserController.registerUser);
userRouter.post("/login", UserController.loginUser);
userRouter.post("/logout", UserController.logoutUser);
userRouter.post("/jio/rcs/webhook", UserController.webhookReceiver);
userRouter.post("/checkAvablityNumber",UserController.checkAvablityNumber);
userRouter.post("/uploadFile", upload.single('file'), UserController.uploadImage);

// User Profile API
userRouter.get("/profile/:userId", UserController.getUserProfile);
userRouter.put("/update-profile/:userId", UserController.updateProfile);
userRouter.get("/profile-with-transactions/:userId", UserController.getUserProfileWithTransactions);
userRouter.get("/messages/:userId", UserController.getUserMessages);
userRouter.get("/messages/today/:userId", UserController.getTodayMessages);

// Wallet APIs
userRouter.post("/wallet/request", UserController.requestWalletRecharge);

// Admin APIs (Protected)
userRouter.get("/admin/dashboard", UserController.getAdminDashboard);
userRouter.get("/admin/users", UserController.getAllUsers);
userRouter.get("/admin/user/:userId", UserController.getUserById);
userRouter.put("/admin/edit-user/:userId", UserController.editUser);
userRouter.delete("/admin/delete-user/:userId", UserController.deleteUser);
userRouter.post("/admin/create-user", UserController.createUser);
userRouter.put("/admin/user-status/:userId", UserController.updateUserStatus);
userRouter.put("/admin/reset-password/:userId", UserController.resetUserPassword);
userRouter.get("/admin/user-stats/:userId", UserController.getUserStats);
userRouter.get("/admin/user-messages/:userId", UserController.getAllUserMessages);
userRouter.post("/admin/add-wallet/:userId", UserController.addWalletBalance);
userRouter.post("/admin/deduct-wallet/:userId", UserController.deductWalletBalance);
userRouter.get("/admin/wallet-requests", UserController.getWalletRequests);
userRouter.post("/admin/wallet/approve/:requestId", UserController.approveWalletRequest);
userRouter.post("/admin/wallet/reject", UserController.rejectWalletRequest);
userRouter.delete("/admin/wallet-request/:requestId", UserController.deleteWalletRequest);
userRouter.get("/admin/user-reports/:userId", UserController.getUserReports);
userRouter.get("/admin/user-orders/:userId", UserController.getUserOrderHistory);



export default userRouter;
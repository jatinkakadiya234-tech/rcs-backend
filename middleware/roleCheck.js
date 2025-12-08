import User from "../User/UserModel.js";

export const adminOnly = async (req, res, next) => {
  try {
    const userId = req.body.userId || req.body.adminId;
    if (!userId) {
      return res.status(401).send({ message: "User ID required" });
    }

    const user = await User.findById(userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).send({ message: "Admin access required" });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(500).send({ message: "Authorization error", error: error.message });
  }
};
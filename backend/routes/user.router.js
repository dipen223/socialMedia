import express from "express";
import userController from "../controllers/user.controller.js";
import multer from "multer";
import auth from "../middlewares/auth.js";

const userRouter = express.Router();

const storage = multer.memoryStorage();

const upload = multer({storage});

userRouter.post("/update_profile_picture",auth,upload.single("profilePicture"),userController.uploadProfile);
userRouter.post("/signup",userController.signup);
userRouter.post("/login",userController.login);
userRouter.post("/updateAccountInfo",auth,userController.updateUserProfile);
userRouter.get("/profile",auth,userController.getUserProfile);
userRouter.post("/updateProfileDetails",auth,userController.updateProfileData);
userRouter.get("/getAllUsers",userController.getAllUserProfile);
userRouter.get("/user/download_profile",userController.downloadProfile);
userRouter.post("/connection-request",auth,userController.connectionRequest);
userRouter.get("/sent-connection-requests",auth,userController.getMySentConnectionRequests);



export default userRouter;
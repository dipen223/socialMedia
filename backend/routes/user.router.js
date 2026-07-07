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



export default userRouter;
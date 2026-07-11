import express from "express";
import postsController from "../controllers/posts.controller.js"
import multer from "multer";
import auth from "../middlewares/auth.js";

const postsRouter = express.Router();
const storage = multer.memoryStorage();

const upload = multer({storage});

postsRouter.get("/allPosts",auth,postsController.getAllPosts);
postsRouter.post("/post",auth,upload.single("media"),postsController.createPost);
postsRouter.delete("/post/:postId",auth,postsController.deletePost);
postsRouter.patch(
    "/posts/:postId/like",
    auth,
    postsController.likePost
);



export default postsRouter;
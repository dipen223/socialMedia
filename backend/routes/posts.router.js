import express from "express";
import postsController from "../controllers/posts.controller.js"
import auth from "../middlewares/auth.js";

const postsRouter = express.Router();

postsRouter.get("/allPosts",auth,postsController.getAllPosts);
postsRouter.post("/media/upload-signature", auth, postsController.getUploadSignature);
postsRouter.post("/post",auth,postsController.createPost);
postsRouter.delete("/post/:postId",auth,postsController.deletePost);
postsRouter.patch(
    "/post/:postId/like",
    auth,
    postsController.likePost
);



export default postsRouter;

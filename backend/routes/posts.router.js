import express from "express";
import postsController from "../controllers/posts.controller.js"
import auth from "../middlewares/auth.js";

const postsRouter = express.Router();

postsRouter.get("/allPosts",auth,postsController.getAllPosts);
postsRouter.get("/trending_hashtags",auth,postsController.getTrendingHashtags);
postsRouter.get("/hashtag/:tag",auth,postsController.getPostsByHashtag);
postsRouter.get("/saved_posts",auth,postsController.getSavedPosts);
postsRouter.post("/media/upload-signature", auth, postsController.getUploadSignature);
postsRouter.post("/post",auth,postsController.createPost);
postsRouter.delete("/post/:postId",auth,postsController.deletePost);
postsRouter.patch(
    "/post/:postId/like",
    auth,
    postsController.likePost
);
postsRouter.patch(
    "/post/:postId/bookmark",
    auth,
    postsController.bookmarkPost
);
postsRouter.put("/post/:postId/face-reaction", auth, postsController.reactWithFace);
postsRouter.delete("/post/:postId/face-reaction", auth, postsController.removeFaceReaction);
postsRouter.get("/post/:postId/reactions",auth,postsController.getPostReactions);


export default postsRouter;

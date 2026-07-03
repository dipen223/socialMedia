import express from "express";
import postsController from "../controllers/posts.controller.js"

const postsRouter = express.Router();

postsRouter.get("/allPosts",postsController);




export default postsRouter;
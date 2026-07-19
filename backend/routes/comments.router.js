import express from "express";
import auth from "../middlewares/auth.js";
import commentsController from "../controllers/comments.controller.js";

const commentsRouter = express.Router();

commentsRouter.post(
    "/posts/:postId/comment",
    auth,
    commentsController.createComment
);

commentsRouter.get(
    "/posts/:postId/comments",
    auth,
    commentsController.getCommentsByPost
);

commentsRouter.delete(
    "/comments/:commentId",
    auth,
    commentsController.deleteComment
)

export default commentsRouter;
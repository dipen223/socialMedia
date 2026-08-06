import express from "express";
import postsRouter from "./posts.router.js";
import userRouter from "./user.router.js";
import aiRouter from "./ai.router.js";
import commentsRouter from "./comments.router.js";
import connectionRouter from "./connection.router.js";
import notificationRouter from "./notification.router.js";
import conversationRouter from "./conversation.router.js";
import messageRouter from "./message.router.js";
import callRouter from "./call.router.js";
import discussionRoomRouter from "./discussionRoom.router.js";
import storyRouter from "./story.router.js";
import faceReactionRouter from "./faceReaction.router.js";

const router = express.Router();

router.use(userRouter);
router.use(postsRouter);
router.use(aiRouter);
router.use(commentsRouter);
router.use(connectionRouter);
router.use(notificationRouter);
router.use(conversationRouter);
router.use(messageRouter);
router.use(callRouter);
router.use(discussionRoomRouter);
router.use(faceReactionRouter);
router.use("/api/stories", storyRouter);


router.get("/",(req,res)=> {res.send("Welcome to SocialHub!")});



export default router;

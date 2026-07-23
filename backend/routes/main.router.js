import express from "express";
import postsRouter from "./posts.router.js";
import userRouter from "./user.router.js";
import aiRouter from "./ai.router.js";
import commentsRouter from "./comments.router.js";
import connectionRouter from "./connection.router.js";

const router = express.Router();

router.use(userRouter);
router.use(postsRouter);
router.use(aiRouter);
router.use(commentsRouter);
router.use(connectionRouter);


router.get("/",(req,res)=> {res.send("Welcome to Ripple!")});



export default router;

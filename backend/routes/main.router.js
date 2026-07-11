import express from "express";
import postsRouter from "./posts.router.js";
import userRouter from "./user.router.js";

const router = express.Router();

router.use(userRouter);
router.use(postsRouter);


router.get("/",(req,res)=> {res.send("Welcome the my Social Media!")});



export default router;
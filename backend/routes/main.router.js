import express from "express";
import postsRouter from "./posts.router.js";

const router = express.Router();


router.get("/",(req,res)=> {res.send("Welcome the my Social Media!")});


export default router;
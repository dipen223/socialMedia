import express from "express";
import reelsController from "../controllers/reels.controller.js";
import auth from "../middlewares/auth.js";

const reelsRouter = express.Router();

reelsRouter.get("/reels", auth, reelsController.getReels);

export default reelsRouter;

import express from "express";
import safetyController from "../controllers/safety.controller.js";
import auth from "../middlewares/auth.js";

const safetyRouter = express.Router();

safetyRouter.get("/safety/restrictions", auth, safetyController.listRestrictions);
safetyRouter.post("/safety/block/:userId", auth, safetyController.blockUser);
safetyRouter.delete("/safety/block/:userId", auth, safetyController.unblockUser);
safetyRouter.post("/safety/mute/:userId", auth, safetyController.muteUser);
safetyRouter.delete("/safety/mute/:userId", auth, safetyController.unmuteUser);
safetyRouter.post("/safety/report", auth, safetyController.createReport);

export default safetyRouter;

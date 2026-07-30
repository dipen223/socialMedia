import express from "express";
import auth from "../middlewares/auth.js";
import callController from "../controllers/call.controller.js";

const callRouter = express.Router();

callRouter.get("/calls/ice-servers", auth, callController.getIceServers);
callRouter.post(
    "/calls/:messageId/summary",
    auth,
    callController.uploadCallRecording,
    callController.createCallSummary
);

export default callRouter;

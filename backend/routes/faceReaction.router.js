import express from "express";
import auth from "../middlewares/auth.js";
import faceReactionController from "../controllers/faceReaction.controller.js";

const faceReactionRouter = express.Router();

faceReactionRouter.get("/face-reactions", auth, faceReactionController.getMyReactions);
faceReactionRouter.post("/face-reactions/upload-signature", auth, faceReactionController.getUploadSignature);
faceReactionRouter.post("/face-reactions", auth, faceReactionController.createReaction);
faceReactionRouter.delete("/face-reactions/:reactionId", auth, faceReactionController.deleteReaction);

export default faceReactionRouter;

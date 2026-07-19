import express from "express";
import aiController from "../controllers/ai.controller.js";
import auth from "../middlewares/auth.js";

const aiRouter = express.Router();

aiRouter.post("/ai/grammar", auth, aiController.correctPostGrammar);
aiRouter.post("/ai/image", auth, aiController.generatePostImage);
aiRouter.delete("/ai/image", auth, aiController.deleteGeneratedImage);

export default aiRouter;

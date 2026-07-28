import express from "express";
import auth from "../middlewares/auth.js";
import conversationController from "../controllers/conversation.controller.js";


const conversationRouter = express.Router();

conversationRouter.post("/conversations/direct",auth,conversationController.createDirectConversation);

conversationRouter.get("/conversations",auth,conversationController.getMyConversations);

export default conversationRouter;
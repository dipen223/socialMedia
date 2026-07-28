import express from "express";
import auth from "../middlewares/auth.js";
import messageController from "../controllers/message.controller.js";

const messageRouter = express.Router();

messageRouter.post("/conversations/:conversationId/messages",auth,messageController.sendMessage);
messageRouter.get("/conversations/:conversationId/messages",auth,messageController.getMessages);
messageRouter.patch(
  "/conversations/:conversationId/read",
  auth,
  messageController.markConversationRead
);


export default messageRouter;
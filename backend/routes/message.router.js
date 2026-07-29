import express from "express";
import auth from "../middlewares/auth.js";
import messageController from "../controllers/message.controller.js";

const messageRouter = express.Router();

messageRouter.post(
  "/messages/upload-signature",
  auth,
  messageController.getAttachmentUploadSignature
);
messageRouter.post("/conversations/:conversationId/messages",auth,messageController.sendMessage);
messageRouter.get("/conversations/:conversationId/messages",auth,messageController.getMessages);
messageRouter.patch("/messages/:messageId", auth, messageController.updateMessage);
messageRouter.delete("/messages/:messageId", auth, messageController.removeMessage);
messageRouter.patch(
  "/conversations/:conversationId/read",
  auth,
  messageController.markConversationRead
);


export default messageRouter;

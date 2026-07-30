import ApplicationError from "../utils/applicationError.js";
import {
  createTextMessage,
  deleteMessage,
  editMessage,
  markConversationMessagesRead,
  markMessageDelivered,
} from "../services/message.service.js";

const registerMessageHandlers = ({
  io,
  socket,
}) => {
  socket.on(
    "message:send",
    async (payload = {}, acknowledgement) => {
      const acknowledge =
        typeof acknowledgement === "function"
          ? acknowledgement
          : () => {};

      try {
        const {
          message,
          memberIds,
          conversation,
        } = await createTextMessage({
          currentUserId: socket.user.id,
          conversationId: payload.conversationId,
          body: payload.body,
          attachment: payload.attachment,
        });

        memberIds.forEach((memberId) => {
          io.to(`user:${memberId}`).emit(
            "message:new",
            {
              message,
              conversation,
            }
          );
        });

        acknowledge({
          ok: true,
          messageId: message._id,
        });
      } catch (error) {
        if (error instanceof ApplicationError) {
          acknowledge({
            ok: false,
            code: error.code,
            message: error.message,
          });
          return;
        }

        console.error(
          "Socket message send failed:",
          error.message
        );

        acknowledge({
          ok: false,
          code: "MESSAGE_SEND_FAILED",
          message: "Could not send the message.",
        });
      }
    }
  );

  socket.on("message:delivered", async (payload = {}, acknowledgement) => {
    const acknowledge =
      typeof acknowledgement === "function" ? acknowledgement : () => {};
    try {
      const result = await markMessageDelivered({
        currentUserId: socket.user.id,
        messageId: payload.messageId,
      });
      result.memberIds.forEach((memberId) => {
        io.to(`user:${memberId}`).emit("message:delivered", {
          messageId: result.messageId,
          conversationId: result.conversationId,
          userId: result.userId,
          deliveredAt: result.deliveredAt,
        });
      });
      acknowledge({ ok: true });
    } catch (error) {
      acknowledge({
        ok: false,
        code: error.code || "MESSAGE_DELIVERY_FAILED",
        message:
          error instanceof ApplicationError
            ? error.message
            : "Could not update delivery status.",
      });
    }
  });

  socket.on("message:edit", async (payload = {}, acknowledgement) => {
    const acknowledge =
      typeof acknowledgement === "function" ? acknowledgement : () => {};
    try {
      const result = await editMessage({
        currentUserId: socket.user.id,
        messageId: payload.messageId,
        body: payload.body,
      });
      result.memberIds.forEach((memberId) => {
        io.to(`user:${memberId}`).emit("message:updated", {
          message: result.message,
        });
      });
      acknowledge({ ok: true });
    } catch (error) {
      acknowledge({
        ok: false,
        code: error.code || "MESSAGE_EDIT_FAILED",
        message:
          error instanceof ApplicationError
            ? error.message
            : "Could not edit the message.",
      });
    }
  });

  socket.on("message:delete", async (payload = {}, acknowledgement) => {
    const acknowledge =
      typeof acknowledgement === "function" ? acknowledgement : () => {};
    try {
      const result = await deleteMessage({
        currentUserId: socket.user.id,
        messageId: payload.messageId,
      });
      result.memberIds.forEach((memberId) => {
        io.to(`user:${memberId}`).emit("message:updated", {
          message: result.message,
        });
      });
      acknowledge({ ok: true });
    } catch (error) {
      acknowledge({
        ok: false,
        code: error.code || "MESSAGE_DELETE_FAILED",
        message:
          error instanceof ApplicationError
            ? error.message
            : "Could not delete the message.",
      });
    }
  });

  socket.on(
    "message:read",
    async (payload = {}, acknowledgement) => {
      const acknowledge =
        typeof acknowledgement === "function"
          ? acknowledgement
          : () => {};

      try {
        const result = await markConversationMessagesRead({
          currentUserId: socket.user.id,
          conversationId: payload.conversationId,
        });

        result.memberIds.forEach((memberId) => {
          io.to(`user:${memberId}`).emit("message:read", {
            conversationId: result.conversationId,
            readerId: result.readerId,
            readAt: result.readAt,
          });
        });

        acknowledge({
          ok: true,
          updatedCount: result.updatedCount,
        });
      } catch (error) {
        if (error instanceof ApplicationError) {
          acknowledge({
            ok: false,
            code: error.code,
            message: error.message,
          });
          return;
        }

        console.error("Socket message read failed:", error.message);
        acknowledge({
          ok: false,
          code: "MESSAGE_READ_FAILED",
          message: "Could not update the read receipt.",
        });
      }
    }
  );
};

export default registerMessageHandlers;

import mongoose from "mongoose";
import Conversation from "../models/conversations.model.js";
import Message from "../models/messages.model.js";
import ApplicationError from "../utils/applicationError.js";
import cloudinary from "../config/cloudinary.js";
import { randomUUID } from "node:crypto";

import {
    ATTACHMENT_LIMITS,
    createTextMessage,
    deleteMessage,
    editMessage,
    markConversationMessagesRead,
} from "../services/message.service.js";

const getAttachmentUploadSignature = (req, res) => {
    const fileType =
        typeof req.body.fileType === "string" ? req.body.fileType : "";
    const fileSize = Number(req.body.fileSize);
    const resourceType = fileType.startsWith("image/")
        ? "image"
        : fileType.startsWith("video/") || fileType.startsWith("audio/")
          ? "video"
          : "raw";

    if (
        !Number.isFinite(fileSize) ||
        fileSize <= 0 ||
        fileSize > ATTACHMENT_LIMITS[resourceType]
    ) {
        const limit = resourceType === "video" ? "100 MB" : resourceType === "image" ? "10 MB" : "25 MB";
        return res.status(400).json({
            message: `This attachment must be smaller than ${limit}.`,
        });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `ripple/messages/${req.user.id}/${randomUUID()}`;
    const paramsToSign = { overwrite: false, public_id: publicId, timestamp };
    const signature = cloudinary.utils.api_sign_request(
        paramsToSign,
        process.env.CLOUDINARY_API_SECRET
    );

    return res.status(200).json({
        apiKey: process.env.CLOUDINARY_API_KEY,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        overwrite: false,
        publicId,
        resourceType,
        signature,
        timestamp,
    });
};

const sendMessage = async (req, res) => {
  try {
    const { message } = await createTextMessage({
      currentUserId: req.user.id,
      conversationId: req.params.conversationId,
      body: req.body.body,
      attachment: req.body.attachment,
    });

    return res.status(201).json({
      message,
    });
  } catch (error) {
    if (error instanceof ApplicationError) {
      return res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
    }

    console.error(
      "Error sending message:",
      error.message
    );

    return res.status(500).json({
      message: "Could not send the message.",
      code: "MESSAGE_SEND_FAILED",
    });
  }
};

const updateMessage = async (req, res) => {
    try {
        const result = await editMessage({
            currentUserId: req.user.id,
            messageId: req.params.messageId,
            body: req.body.body,
        });
        return res.status(200).json({ message: result.message });
    } catch (error) {
        if (error instanceof ApplicationError) {
            return res.status(error.statusCode).json({
                message: error.message,
                code: error.code,
            });
        }
        console.error("Error editing message:", error.message);
        return res.status(500).json({ message: "Could not edit the message." });
    }
};

const removeMessage = async (req, res) => {
    try {
        const result = await deleteMessage({
            currentUserId: req.user.id,
            messageId: req.params.messageId,
        });
        return res.status(200).json({ message: result.message });
    } catch (error) {
        if (error instanceof ApplicationError) {
            return res.status(error.statusCode).json({
                message: error.message,
                code: error.code,
            });
        }
        console.error("Error deleting message:", error.message);
        return res.status(500).json({ message: "Could not delete the message." });
    }
};

const getMessages = async (req, res) => {
    const currentUserId = req.user.id;
    const { conversationId } = req.params;

    const before =
        typeof req.query.before === "string"
            ? req.query.before
            : "";

    const beforeDate = before ? new Date(before) : null;


    if (!mongoose.isValidObjectId(conversationId)) {
        return res.status(400).json({
            message: "Invalid conversation.",
        });
    }


    if (before && Number.isNaN(beforeDate.getTime())) {
        return res.status(400).json({
            message: "Invalid message cursor.",
        });
    }

    try {

        const conversationExists = await Conversation.exists({
            _id: conversationId,
            members: currentUserId,
        });

        if (!conversationExists) {
            return res.status(404).json({
                message: "Conversation not found.",
            });
        }


        const messageFilter = {
            conversationId,
        };

        if (beforeDate) {
            messageFilter.createdAt = {
                $lt: beforeDate,
            };
        }


        let messages = await Message.find(messageFilter)
            .populate(
                "senderId",
                "name username profilePicture"
            )
            .sort({ createdAt: -1 })
            .limit(31)
            .lean();


        const hasMore = messages.length > 30;

        if (hasMore) {
            messages.pop();
        }


        const nextCursor =
            hasMore && messages.length > 0
                ? messages[messages.length - 1].createdAt
                : null;

        messages.reverse();

        return res.status(200).json({
            count: messages.length,
            messages,
            hasMore,
            nextCursor,
        });
    } catch (error) {
        console.error(
            "Error retrieving messages:",
            error.message
        );

        return res.status(500).json({
            message: "Could not retrieve messages.",
        });
    }
};
const markConversationRead = async (req, res) => {
    try {
        const result = await markConversationMessagesRead({
            currentUserId: req.user.id,
            conversationId: req.params.conversationId,
        });

        return res.status(200).json({
            message: "Conversation marked as read.",
            updatedCount: result.updatedCount,
            readAt: result.readAt,
        });
    } catch (error) {
        if (error instanceof ApplicationError) {
            return res.status(error.statusCode).json({
                message: error.message,
                code: error.code,
            });
        }

        console.error("Error marking conversation as read:", error.message);

        return res.status(500).json({
            message: "Could not mark the conversation as read.",
        });
    }
};



export default {
    sendMessage,
    getMessages,
    getAttachmentUploadSignature,
    markConversationRead,
    removeMessage,
    updateMessage,
};

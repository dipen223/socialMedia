import mongoose from "mongoose";
import Conversation from "../models/conversations.model.js";
import Message from "../models/messages.model.js";

const sendMessage = async (req, res) => {
    const currentUserId = req.user.id;

    const { conversationId } = req.params;
    const body = typeof req.body.body === "string" ? req.body.body.trim() : "";

    if (!mongoose.isValidObjectId(conversationId)) {
        return res.status(400).json({
            message: "Invalid conversation.",
        });
    }

    if (body.length === 0) {
        return res.status(400).json({
            message: "Write a message before sending.",
        });
    }
    if (body.length > 5000) {
        return res.status(400).json({
            message: "Messages cannot exceed 5,000 characters.",
        });
    }


    try {
        const conversation = await Conversation.findOne({
            _id: conversationId,
            members: currentUserId,
        }).select("_id");

        if (!conversation) {
            return res.status(404).json({
                message: "Conversation not found.",
            });
        }

        const message = await Message.create({
            conversationId: conversation._id,
            senderId: currentUserId,
            body,
            type: "text",
            readBy: [
                {
                    userId: currentUserId,
                },
            ],
        });

        await message.populate(
            "senderId",
            "name username profilePicture"
        );

        await Conversation.updateOne(
            {
                _id: conversation._id,
            },
            {
                $set: {
                    lastMessageId: message._id,
                },
            }
        );

        return res.status(201).json({
            message,
        });
    } catch (err) {
        console.error("Error sending message:", err.message);

        return res.status(500).json({
            message: "Could not send the message.",
        });
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
    const currentUserId = req.user.id;
    const { conversationId } = req.params;

    if (!mongoose.isValidObjectId(conversationId)) {
        return res.status(400).json({
            message: "Invalid conversation.",
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

        const readAt = new Date();

        const result = await Message.updateMany(
            {
                conversationId,
                senderId: { $ne: currentUserId },
                "readBy.userId": { $ne: currentUserId },
            },
            {
                $push: {
                    readBy: {
                        userId: currentUserId,
                        readAt,
                    },
                },
            }
        );

        return res.status(200).json({
            message: "Conversation marked as read.",
            updatedCount: result.modifiedCount,
            readAt,
        });
    } catch (error) {
        console.error("Error marking conversation as read:", error.message);

        return res.status(500).json({
            message: "Could not mark the conversation as read.",
        });
    }
};



export default { sendMessage, getMessages, markConversationRead };

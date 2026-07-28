import mongoose from "mongoose";
import Conversation from "../models/conversations.model.js";
import User from "../models/user.model.js";


const createDirectConversation = async (req, res) => {
    const currentUserId = req.user.id;
    const { recipientId } = req.body;

    if (!recipientId) {
        return res.status(400).json({ message: "Recipient is required! " });
    }

    if (!mongoose.isValidObjectId(recipientId)) {
        return res.status(400).json({ message: "Invalid recipient" });
    }

    if (recipientId.toString() === currentUserId.toString()) {
        return res.status(400).json({ message: "You cannot message yourself!" });
    }

    try {
        const recipientExists = await User.exists({
            _id: recipientId,
        });

        if (!recipientExists) {
            return res.status(404).json({
                message: "Recipient does not exist.",
            });
        }
        const directKey = [currentUserId, recipientId]
            .map(String)
            .sort()
            .join(":");
        const conversation = await Conversation.findOneAndUpdate(
            {
                directKey,
            },
            {
                $setOnInsert: {
                    members: [currentUserId, recipientId],
                    type: "direct",
                    createdBy: currentUserId,
                },
            },
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true,
            }
        ).populate("members", "name username profilePicture");
        return res.status(200).json({
            conversation,
        });

    } catch (err) {
        console.error("Error creating direct conversation", err.message);

        return res.status(500).json({
            message: "Could not create the converstaion.",
        });
    }
};

const getMyConversations = async (req, res) => {
    const currentUserId = req.user.id;
    try {
        const conversations = await Conversation.find({
            members: currentUserId,
        })
            .populate("members", "name username profilePicture")
            .populate({
                path: "lastMessageId",
                select: "body type senderId createdAt",
                populate: {
                    path: "senderId",
                    select: "name username profilePicture",
                },
            })
            .sort({ updatedAt: -1 })
            .lean();
        return res.status(200).json({
            count: conversations.length,
            conversations,
        });

    } catch (err) {
        console.error("Error retrieving conversations.", err.message);
        return res.status(500).json({ message: "Could not retrieve converstations" });
    }
}

export default {
    createDirectConversation, getMyConversations
}
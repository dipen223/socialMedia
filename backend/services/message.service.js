import mongoose from "mongoose";
import cloudinary from "../config/cloudinary.js";
import Conversation from "../models/conversations.model.js";
import Message from "../models/messages.model.js";
import Notification from "../models/notification.model.js";
import ApplicationError from "../utils/applicationError.js";

const ATTACHMENT_LIMITS = {
    image: 10 * 1024 * 1024,
    video: 100 * 1024 * 1024,
    raw: 25 * 1024 * 1024,
};

const populateMessage = (query) =>
    query.populate("senderId", "name username profilePicture");

const getConversation = async (conversationId, currentUserId) => {
    if (!mongoose.isValidObjectId(conversationId)) {
        throw new ApplicationError(
            "Invalid conversation.",
            400,
            "INVALID_CONVERSATION"
        );
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        members: currentUserId,
    }).select("_id members");

    if (!conversation) {
        throw new ApplicationError(
            "Conversation not found.",
            404,
            "CONVERSATION_NOT_FOUND"
        );
    }

    return conversation;
};

const verifyAttachment = async (attachment, currentUserId) => {
    if (!attachment) return null;

    const resourceType = ["image", "video", "raw"].includes(
        attachment.resourceType
    )
        ? attachment.resourceType
        : null;
    const expectedPrefix = `ripple/messages/${currentUserId}/`;

    if (
        !resourceType ||
        typeof attachment.publicId !== "string" ||
        !attachment.publicId.startsWith(expectedPrefix)
    ) {
        throw new ApplicationError(
            "Invalid message attachment.",
            400,
            "INVALID_ATTACHMENT"
        );
    }

    let asset;
    try {
        asset = await cloudinary.api.resource(attachment.publicId, {
            resource_type: resourceType,
        });
    } catch {
        throw new ApplicationError(
            "The uploaded attachment could not be verified.",
            400,
            "INVALID_ATTACHMENT"
        );
    }

    if (asset.bytes > ATTACHMENT_LIMITS[resourceType]) {
        await cloudinary.uploader.destroy(asset.public_id, {
            resource_type: resourceType,
        });
        throw new ApplicationError(
            "The uploaded attachment is too large.",
            400,
            "ATTACHMENT_TOO_LARGE"
        );
    }

    const fileType =
        typeof attachment.fileType === "string"
            ? attachment.fileType.slice(0, 150)
            : "";
    const fileName =
        typeof attachment.fileName === "string" && attachment.fileName.trim()
            ? attachment.fileName.trim().slice(0, 180)
            : "Attachment";

    return {
        url: asset.secure_url,
        publicId: asset.public_id,
        resourceType,
        fileType,
        fileName,
        bytes: asset.bytes,
    };
};

const getMessageType = (attachment) => {
    if (!attachment) return "text";
    if (attachment.fileType.startsWith("image/")) return "image";
    if (attachment.fileType.startsWith("video/")) return "video";
    if (attachment.fileType.startsWith("audio/")) return "audio";
    return "file";
};

const createTextMessage = async ({
    currentUserId,
    conversationId,
    body: rawBody,
    attachment: rawAttachment,
}) => {
    const body = typeof rawBody === "string" ? rawBody.trim() : "";

    if (!body && !rawAttachment) {
        throw new ApplicationError(
            "Write a message or add an attachment before sending.",
            400,
            "EMPTY_MESSAGE"
        );
    }

    if (body.length > 5000) {
        throw new ApplicationError(
            "Messages cannot exceed 5,000 characters.",
            400,
            "MESSAGE_TOO_LONG"
        );
    }

    const conversation = await getConversation(conversationId, currentUserId);
    const attachment = await verifyAttachment(rawAttachment, currentUserId);
    const message = await Message.create({
        conversationId: conversation._id,
        senderId: currentUserId,
        body,
        type: getMessageType(attachment),
        attachments: attachment ? [attachment] : [],
        readBy: [{ userId: currentUserId }],
        deliveredTo: [{ userId: currentUserId }],
    });

    await populateMessage(message);

    await Conversation.updateOne(
        { _id: conversation._id },
        { $set: { lastMessageId: message._id } }
    );

    const recipientIds = conversation.members
        .map(String)
        .filter((memberId) => memberId !== currentUserId.toString());

    if (recipientIds.length) {
        await Notification.insertMany(
            recipientIds.map((recipientId) => ({
                recipientId,
                actorId: currentUserId,
                type: "new_message",
                conversationId: conversation._id,
                messageId: message._id,
            }))
        ).catch((error) => {
            console.error("Could not create message notification:", error.message);
        });
    }

    const conversationSummary = await Conversation.findById(conversation._id)
        .populate("members", "name username profilePicture")
        .populate({
            path: "lastMessageId",
            select:
                "body type call attachments senderId readBy deliveredTo editedAt deletedAt createdAt",
            populate: {
                path: "senderId",
                select: "name username profilePicture",
            },
        })
        .lean();

    return {
        message,
        memberIds: conversation.members.map(String),
        conversation: conversationSummary,
    };
};

const markConversationMessagesRead = async ({
    currentUserId,
    conversationId,
}) => {
    const conversation = await getConversation(conversationId, currentUserId);
    const readAt = new Date();
    const result = await Message.updateMany(
        {
            conversationId,
            senderId: { $ne: currentUserId },
            "readBy.userId": { $ne: currentUserId },
        },
        {
            $push: {
                readBy: { userId: currentUserId, readAt },
            },
        }
    );

    await Notification.updateMany(
        {
            recipientId: currentUserId,
            conversationId,
            type: { $in: ["new_message", "missed_call"] },
            readAt: null,
        },
        { $set: { readAt } }
    );

    return {
        conversationId: conversation._id.toString(),
        memberIds: conversation.members.map(String),
        readerId: currentUserId.toString(),
        readAt,
        updatedCount: result.modifiedCount,
    };
};

const markMessageDelivered = async ({ currentUserId, messageId }) => {
    if (!mongoose.isValidObjectId(messageId)) {
        throw new ApplicationError("Invalid message.", 400, "INVALID_MESSAGE");
    }

    const message = await Message.findById(messageId).select(
        "_id conversationId senderId deliveredTo"
    );
    if (!message) {
        throw new ApplicationError("Message not found.", 404, "MESSAGE_NOT_FOUND");
    }

    const conversation = await getConversation(
        message.conversationId,
        currentUserId
    );
    const deliveredAt = new Date();

    if (
        message.senderId.toString() !== currentUserId.toString() &&
        !message.deliveredTo.some(
            (receipt) => receipt.userId.toString() === currentUserId.toString()
        )
    ) {
        await Message.updateOne(
            { _id: messageId, "deliveredTo.userId": { $ne: currentUserId } },
            {
                $push: {
                    deliveredTo: { userId: currentUserId, deliveredAt },
                },
            }
        );
    }

    return {
        messageId: message._id.toString(),
        conversationId: message.conversationId.toString(),
        memberIds: conversation.members.map(String),
        userId: currentUserId.toString(),
        deliveredAt,
    };
};

const editMessage = async ({ currentUserId, messageId, body: rawBody }) => {
    const body = typeof rawBody === "string" ? rawBody.trim() : "";
    if (!mongoose.isValidObjectId(messageId)) {
        throw new ApplicationError("Invalid message.", 400, "INVALID_MESSAGE");
    }
    if (!body || body.length > 5000) {
        throw new ApplicationError(
            body ? "Messages cannot exceed 5,000 characters." : "A message cannot be empty.",
            400,
            body ? "MESSAGE_TOO_LONG" : "EMPTY_MESSAGE"
        );
    }

    const existing = await Message.findOne({
        _id: messageId,
        senderId: currentUserId,
        deletedAt: null,
    });
    if (!existing) {
        throw new ApplicationError(
            "Message not found or cannot be edited.",
            404,
            "MESSAGE_NOT_FOUND"
        );
    }

    const conversation = await getConversation(
        existing.conversationId,
        currentUserId
    );
    existing.body = body;
    existing.editedAt = new Date();
    await existing.save();
    await populateMessage(existing);

    return {
        message: existing,
        memberIds: conversation.members.map(String),
    };
};

const deleteMessage = async ({ currentUserId, messageId }) => {
    if (!mongoose.isValidObjectId(messageId)) {
        throw new ApplicationError("Invalid message.", 400, "INVALID_MESSAGE");
    }

    const existing = await Message.findOne({
        _id: messageId,
        senderId: currentUserId,
        deletedAt: null,
    });
    if (!existing) {
        throw new ApplicationError(
            "Message not found or already deleted.",
            404,
            "MESSAGE_NOT_FOUND"
        );
    }

    const conversation = await getConversation(
        existing.conversationId,
        currentUserId
    );
    const attachments = [...existing.attachments];
    existing.body = "";
    existing.attachments = [];
    existing.deletedAt = new Date();
    existing.editedAt = null;
    await existing.save();
    await populateMessage(existing);

    attachments.forEach((attachment) => {
        cloudinary.uploader
            .destroy(attachment.publicId, {
                resource_type: attachment.resourceType,
            })
            .catch((error) =>
                console.error("Could not remove message attachment:", error.message)
            );
    });

    return {
        message: existing,
        memberIds: conversation.members.map(String),
    };
};

const createCallHistoryMessage = async ({
    conversationId,
    callerId,
    calleeId,
    mode,
    status,
    durationSeconds,
    callId,
    summaryConsent,
}) => {
    const endedAt = new Date();
    const wasSeenByCallee = status !== "missed";
    const message = await Message.create({
        conversationId,
        senderId: callerId,
        body: "",
        type: "call",
        call: {
            mode,
            status,
            durationSeconds: Math.max(0, Math.round(durationSeconds || 0)),
            endedAt,
            callId,
            summary: summaryConsent
                ? {
                    status: "pending",
                    requestedBy: summaryConsent.requestedBy,
                    consentedBy: [callerId, calleeId],
                }
                : undefined,
        },
        readBy: [
            { userId: callerId },
            ...(wasSeenByCallee ? [{ userId: calleeId }] : []),
        ],
        deliveredTo: [
            { userId: callerId },
            ...(wasSeenByCallee ? [{ userId: calleeId }] : []),
        ],
    });
    await populateMessage(message);

    await Conversation.updateOne(
        { _id: conversationId },
        { $set: { lastMessageId: message._id } }
    );

    if (status === "missed") {
        await Notification.create({
            recipientId: calleeId,
            actorId: callerId,
            type: "missed_call",
            conversationId,
            messageId: message._id,
        }).catch((error) => {
            console.error("Could not create missed-call notification:", error.message);
        });
    }

    const conversation = await Conversation.findById(conversationId)
        .populate("members", "name username profilePicture")
        .populate({
            path: "lastMessageId",
            select:
                "body type call senderId readBy deliveredTo createdAt",
            populate: {
                path: "senderId",
                select: "name username profilePicture",
            },
        })
        .lean();

    return {
        message,
        conversation,
        memberIds: [callerId.toString(), calleeId.toString()],
    };
};

export {
    ATTACHMENT_LIMITS,
    createTextMessage,
    createCallHistoryMessage,
    deleteMessage,
    editMessage,
    markConversationMessagesRead,
    markMessageDelivered,
};

import multer from "multer";
import Conversation from "../models/conversations.model.js";
import Message from "../models/messages.model.js";
import {
    summarizeCallTranscript,
    transcribeCallAudio,
} from "../services/ai.service.js";

let cachedIceServers = null;
let iceServersExpireAt = 0;

const getIceServers = async (_req, res) => {
    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;

    if (!keyId || !apiToken) {
        return res.status(503).json({
            message: "TURN service is not configured.",
        });
    }

    if (cachedIceServers && Date.now() < iceServersExpireAt) {
        return res.status(200).json({ iceServers: cachedIceServers });
    }

    try {
        const ttl = 3600;
        const response = await fetch(
            `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ ttl }),
            }
        );
        const data = await response.json();

        if (!response.ok || !Array.isArray(data.iceServers)) {
            console.error(
                "Cloudflare TURN credential request failed:",
                response.status,
                data
            );
            return res.status(502).json({
                message: "Could not retrieve call relay credentials.",
            });
        }

        cachedIceServers = data.iceServers;
        iceServersExpireAt = Date.now() + (ttl - 300) * 1000;
        return res.status(200).json({ iceServers: cachedIceServers });
    } catch (error) {
        console.error("Cloudflare TURN request failed:", error.message);
        return res.status(502).json({
            message: "Could not retrieve call relay credentials.",
        });
    }
};

const recordingUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 24 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
        const supported = [
            "audio/webm",
            "video/webm",
            "audio/ogg",
            "audio/mp4",
        ].includes(file.mimetype);
        callback(
            supported ? null : new Error("Unsupported call recording format."),
            supported
        );
    },
}).single("recording");

const uploadCallRecording = (req, res, next) => {
    recordingUpload(req, res, (error) => {
        if (!error) return next();
        const isTooLarge = error.code === "LIMIT_FILE_SIZE";
        return res.status(400).json({
            message: isTooLarge
                ? "The call recording exceeds the one-hour processing limit."
                : error.message,
        });
    });
};

const emitUpdatedMessage = async (req, message) => {
    const conversation = await Conversation.findById(message.conversationId)
        .select("members")
        .lean();
    const io = req.app.get("io");
    conversation?.members.forEach((memberId) => {
        io?.to(`user:${memberId}`).emit("message:updated", { message });
    });
};

const createCallSummary = async (req, res) => {
    if (!req.file?.buffer) {
        return res.status(400).json({ message: "Call recording is required." });
    }

    const message = await Message.findOne({
        _id: req.params.messageId,
        senderId: req.user.id,
        type: "call",
        "call.status": "completed",
        "call.summary.status": "pending",
        "call.summary.consentedBy": { $all: [req.user.id] },
        "call.summary.consentedBy.1": { $exists: true },
    });
    if (!message) {
        return res.status(404).json({
            message: "A consented call summary request was not found.",
        });
    }

    try {
        message.call.summary.status = "processing";
        await message.save();
        await message.populate("senderId", "name username profilePicture");
        await emitUpdatedMessage(req, message);

        const transcript = await transcribeCallAudio({
            buffer: req.file.buffer,
            mimeType: req.file.mimetype,
        });
        const summary = await summarizeCallTranscript(transcript);

        message.call.summary.status = "ready";
        message.call.summary.overview = summary.overview;
        message.call.summary.keyPoints = summary.keyPoints;
        message.call.summary.actionItems = summary.actionItems;
        message.call.summary.error = "";
        await message.save();
        await emitUpdatedMessage(req, message);

        return res.status(201).json({ message });
    } catch (error) {
        console.error("Call summary generation failed:", error.message);
        message.call.summary.status = "failed";
        message.call.summary.error =
            "SocialHub could not summarize this call.";
        await message.save().catch(() => {});
        await emitUpdatedMessage(req, message).catch(() => {});
        return res.status(500).json({
            message: "SocialHub could not summarize this call.",
        });
    }
};

export default {
    createCallSummary,
    getIceServers,
    uploadCallRecording,
};

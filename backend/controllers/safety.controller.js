import mongoose from "mongoose";
import Block from "../models/block.model.js";
import Report, { REPORT_REASONS } from "../models/report.model.js";
import Connection from "../models/connections.model.js";
import User from "../models/user.model.js";
import Post from "../models/posts.model.js";
import Comment from "../models/comments.model.js";

const validTarget = (req, res) => {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) {
        res.status(400).json({ message: "Invalid user." });
        return null;
    }
    if (userId === req.user.id.toString()) {
        res.status(400).json({ message: "You can't do that to yourself." });
        return null;
    }
    return userId;
};

const restrict = (kind) => async (req, res) => {
    const targetId = validTarget(req, res);
    if (!targetId) return undefined;
    const userId = req.user.id;

    try {
        const target = await User.findById(targetId).select("_id");
        if (!target) {
            return res.status(404).json({ message: "User not found." });
        }

        const existing = await Block.findOne({ blockerId: userId, blockedId: targetId });
        // A mute never weakens an existing block.
        if (existing?.kind === "block" && kind === "mute") {
            return res.status(200).json({ kind: "block" });
        }

        await Block.updateOne(
            { blockerId: userId, blockedId: targetId },
            { $set: { kind } },
            { upsert: true }
        );

        if (kind === "block") {
            // Blocking ends any connection or pending request either way.
            await Connection.deleteMany({
                $or: [
                    { requesterId: userId, recipientId: targetId },
                    { requesterId: targetId, recipientId: userId },
                ],
            });
        }

        return res.status(200).json({ kind });
    } catch (err) {
        console.error(`Error applying ${kind}!`, err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};

const lift = (kind) => async (req, res) => {
    const targetId = validTarget(req, res);
    if (!targetId) return undefined;

    try {
        await Block.deleteOne({ blockerId: req.user.id, blockedId: targetId, kind });
        return res.status(200).json({ message: kind === "block" ? "Unblocked." : "Unmuted." });
    } catch (err) {
        console.error(`Error lifting ${kind}!`, err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};

const listRestrictions = async (req, res) => {
    try {
        const rows = await Block.find({ blockerId: req.user.id })
            .sort({ createdAt: -1 })
            .populate("blockedId", "name username profilePicture")
            .lean();
        // A user deleted since being blocked leaves a null populate - skip it.
        const restrictions = rows
            .filter((row) => row.blockedId)
            .map((row) => ({ kind: row.kind, user: row.blockedId, createdAt: row.createdAt }));
        return res.status(200).json({ restrictions });
    } catch (err) {
        console.error("Error listing restrictions!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};

const createReport = async (req, res) => {
    const { targetType, targetId, reason } = req.body;
    const details = typeof req.body.details === "string" ? req.body.details.trim().slice(0, 500) : "";

    if (!["user", "post", "comment"].includes(targetType)) {
        return res.status(400).json({ message: "Invalid report target." });
    }
    if (!mongoose.isValidObjectId(targetId)) {
        return res.status(400).json({ message: "Invalid report target." });
    }
    if (!REPORT_REASONS.includes(reason)) {
        return res.status(400).json({ message: "Choose a reason for the report." });
    }

    try {
        let targetUserId;
        if (targetType === "user") {
            const user = await User.findById(targetId).select("_id");
            targetUserId = user?._id;
        } else if (targetType === "post") {
            const post = await Post.findOne({ _id: targetId, active: true }).select("userId");
            targetUserId = post?.userId;
        } else {
            const comment = await Comment.findById(targetId).select("userId");
            targetUserId = comment?.userId;
        }

        if (!targetUserId) {
            return res.status(404).json({ message: "That content no longer exists." });
        }
        if (targetUserId.toString() === req.user.id.toString()) {
            return res.status(400).json({ message: "You can't report your own content." });
        }

        try {
            await Report.create({
                reporterId: req.user.id,
                targetType,
                targetId,
                targetUserId,
                reason,
                details,
            });
        } catch (err) {
            // Already reported by this person - same outcome as the first time.
            if (err.code !== 11000) throw err;
        }

        return res.status(201).json({ message: "Thanks - we'll review this." });
    } catch (err) {
        console.error("Error creating report!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};

export default {
    blockUser: restrict("block"),
    muteUser: restrict("mute"),
    unblockUser: lift("block"),
    unmuteUser: lift("mute"),
    listRestrictions,
    createReport,
};

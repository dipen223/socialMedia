import mongoose from "mongoose";
import Post from "../models/posts.model.js";
import Comment from "../models/comments.model.js";
import { withVideoDelivery, videoThumbnail } from "../services/cloudinaryVideo.service.js";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;


const getReels = async (req, res) => {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
        : DEFAULT_LIMIT;

    // Every video post is a reel - there's no separate reel type. Posting a
    // video puts it in the main feed AND here; this tab is just the
    // video-only view of the same posts.
    const query = { active: true, mediaResourceType: "video" };

    if (req.query.before) {
        if (!mongoose.isValidObjectId(req.query.before)) {
            return res.status(400).json({ message: "Invalid cursor." });
        }
        query._id = { $lt: req.query.before };
    }

    try {
        const posts = await Post.find(query)
            .sort({ _id: -1 })
            .limit(limit)
            .populate("userId", "name username profilePicture")
            .populate("faceReactions.userId", "name username")
            .populate("faceReactions.reactionId", "name imageUrl ownerId active")
            .populate({
                path: "repostOf",
                populate: { path: "userId", select: "name username profilePicture" },
            })
            .lean();

        const postIds = posts.map((post) => post._id);
        const commentCounts = await Comment.aggregate([
            { $match: { postId: { $in: postIds } } },
            { $group: { _id: "$postId", count: { $sum: 1 } } },
        ]);
        const countMap = new Map(commentCounts.map((c) => [c._id.toString(), c.count]));

        const reels = posts.map((post) => ({
            ...post,
            commentCount: countMap.get(post._id.toString()) || 0,
            playbackUrl: withVideoDelivery(post.media),
            thumbnailUrl: videoThumbnail(post.media),
        }));

        const nextCursor = posts.length === limit ? posts[posts.length - 1]._id : null;

        return res.status(200).json({ reels, nextCursor });
    } catch (err) {
        console.error("Error building reels feed!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};


export default { getReels };

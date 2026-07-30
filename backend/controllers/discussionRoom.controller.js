import mongoose from "mongoose";
import Post from "../models/posts.model.js";
import DiscussionRoom from "../models/discussionRoom.model.js";
import DiscussionMessage from "../models/discussionMessage.model.js";

const roomPopulate = [
    { path: "hostId", select: "name username profilePicture" },
    { path: "speakerIds", select: "name username profilePicture" },
    {
        path: "postId",
        select: "body userId",
        populate: { path: "userId", select: "name username profilePicture" },
    },
];

const startRoom = async (req, res) => {
    const { postId } = req.params;
    const currentUserId = req.user.id;

    if (!mongoose.isValidObjectId(postId)) {
        return res.status(400).json({ message: "Invalid post." });
    }

    try {
        const post = await Post.findOne({ _id: postId, active: true }).select("userId body");
        if (!post) return res.status(404).json({ message: "Post not found." });
        if (post.userId.toString() !== currentUserId.toString()) {
            return res.status(403).json({ message: "Only the post author can start its discussion." });
        }

        let room = await DiscussionRoom.findOne({ postId, status: "live" });
        if (!room) {
            const requestedTitle =
                typeof req.body?.title === "string" ? req.body.title.trim() : "";
            room = await DiscussionRoom.create({
                postId,
                hostId: currentUserId,
                speakerIds: [currentUserId],
                title: requestedTitle || `Discuss: ${post.body.slice(0, 72)}`,
            });
            req.app.get("io")?.emit("discussion:started", {
                postId: post._id.toString(),
                roomId: room._id.toString(),
            });
        }

        await room.populate(roomPopulate);
        return res.status(201).json({ room });
    } catch (error) {
        if (error?.code === 11000) {
            const room = await DiscussionRoom.findOne({ postId, status: "live" })
                .populate(roomPopulate);
            return res.status(200).json({ room });
        }
        console.error("Could not start discussion room:", error.message);
        return res.status(500).json({ message: "Could not start the discussion." });
    }
};

const getRoom = async (req, res) => {
    const { roomId } = req.params;
    if (!mongoose.isValidObjectId(roomId)) {
        return res.status(400).json({ message: "Invalid discussion room." });
    }

    try {
        const room = await DiscussionRoom.findById(roomId).populate(roomPopulate);
        if (!room) return res.status(404).json({ message: "Discussion room not found." });

        return res.status(200).json({
            room,
            media: {
                provider: "cloudflare-sfu",
                configured: Boolean(
                    process.env.CLOUDFLARE_REALTIME_APP_ID &&
                    process.env.CLOUDFLARE_REALTIME_APP_SECRET
                ),
            },
        });
    } catch (error) {
        console.error("Could not get discussion room:", error.message);
        return res.status(500).json({ message: "Could not load the discussion." });
    }
};

const getMessages = async (req, res) => {
    const { roomId } = req.params;
    if (!mongoose.isValidObjectId(roomId)) {
        return res.status(400).json({ message: "Invalid discussion room." });
    }
    try {
        const room = await DiscussionRoom.exists({ _id: roomId });
        if (!room) {
            return res.status(404).json({ message: "Discussion room not found." });
        }
        const messages = await DiscussionMessage.find({ roomId })
            .sort({ createdAt: -1 })
            .limit(100)
            .populate("senderId", "name username profilePicture")
            .lean();
        return res.status(200).json({ messages: messages.reverse() });
    } catch (error) {
        console.error("Could not get discussion messages:", error.message);
        return res.status(500).json({ message: "Could not load live chat." });
    }
};

export default { startRoom, getRoom, getMessages };

import mongoose from "mongoose";
import User from "../models/user.model.js";
import Post from "../models/posts.model.js";
import cloudinary from "../config/cloudinary.js";
import Comment from "../models/comments.model.js";
import Notification from "../models/notification.model.js";
import DiscussionRoom from "../models/discussionRoom.model.js";
import { randomUUID } from "crypto";
import FaceReaction from "../models/faceReaction.model.js";

const MEDIA_LIMITS = {
    image: 10 * 1024 * 1024,
    video: 100 * 1024 * 1024
};

const getUploadSignature = async (req, res) => {
    const isVideo = req.body.fileType?.startsWith("video/");
    const isImage = req.body.fileType?.startsWith("image/");
    if (!isVideo && !isImage) {
        return res.status(400).json({ message: "Only image and video uploads are supported." });
    }

    const resourceType = isVideo ? "video" : "image";
    const fileSize = Number(req.body.fileSize);

    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MEDIA_LIMITS[resourceType]) {
        const limit = resourceType === "video" ? "100 MB" : "10 MB";
        return res.status(400).json({ message: `${resourceType === "video" ? "Videos" : "Images"} must be smaller than ${limit}.` });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `ripple/posts/${req.user.id}/${randomUUID()}`;
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
        timestamp
    });
};

const createPost = async (req, res) => {
    const userId = req.user.id;

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found!" });
        }

        let mediaUrl = "";
        let fileType = "";
        let mediaPublicId = "";
        let mediaResourceType = "";
        let aiGenerated = false;

        if (req.body.mediaPublicId && req.body.mediaResourceType) {
            const expectedPrefix = `ripple/posts/${userId}/`;
            if (!req.body.mediaPublicId.startsWith(expectedPrefix)) {
                return res.status(400).json({ message: "Invalid media upload." });
            }

            mediaResourceType = req.body.mediaResourceType === "video" ? "video" : "image";
            const asset = await cloudinary.api.resource(req.body.mediaPublicId, {
                resource_type: mediaResourceType
            });

            if (asset.bytes > MEDIA_LIMITS[mediaResourceType]) {
                await cloudinary.uploader.destroy(asset.public_id, { resource_type: mediaResourceType });
                return res.status(400).json({ message: "Uploaded media is too large." });
            }

            mediaUrl = asset.secure_url;
            mediaPublicId = asset.public_id;
            fileType = `${mediaResourceType}/${asset.format}`;
            aiGenerated = mediaResourceType === "image"
                && asset.context?.custom?.ai_generated === "true"
                && asset.context?.custom?.owner === userId.toString();
        }

        const post = await Post.create({
            userId,
            body: req.body.body,
            media: mediaUrl,
            fileType,
            mediaPublicId,
            mediaResourceType,
            aiGenerated
        });

        return res.status(201).json({
            message: "Post created successfully!",
            post
        });


    } catch (err) {
        console.error("Error creating a post!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }

};

const getAllPosts = async (req, res) => {

    try {
        const posts = await Post.find({ active: true })
            .sort({ createdAt: -1 })
            .populate("userId", "name username email profilePicture")
            .populate("faceReactions.userId", "name username")
            .populate("faceReactions.reactionId", "name imageUrl ownerId active")
            .lean();

        const postIds = posts.map((post) => post._id);

        const [liveRooms, commentCounts] = await Promise.all([
            DiscussionRoom.find({
                postId: { $in: postIds },
                status: "live",
            })
                .select("postId title participantCount hostId")
                .lean(),
            Comment.aggregate([
                { $match: { postId: { $in: postIds } } },
                { $group: { _id: "$postId", count: { $sum: 1 } } }
            ])
        ]);

        const roomsByPost = new Map(
            liveRooms.map((room) => [room.postId.toString(), room])
        );
        const countMap = new Map(
            commentCounts.map((c) => [c._id.toString(), c.count])
        );

        const postsWithDetails = posts.map((post) => ({
            ...post,
            commentCount: countMap.get(post._id.toString()) || 0,
            liveDiscussion: roomsByPost.get(post._id.toString()) || null,
        }));

        return res.status(200).json({ count: posts.length, posts: postsWithDetails });

    } catch (err) {
        console.error("Error getting posts!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }

};

const deletePost = async (req, res) => {
    const userId = req.user.id;
    const { postId } = req.params;

    try {
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ message: "Post not found!" });
        }

        if (post.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                message: "You cannot delete this post"
            });
        }

        await post.deleteOne();
        await Promise.all([
            Comment.deleteMany({ postId }),
            Notification.deleteMany({ postId }),
            DiscussionRoom.deleteMany({ postId })
        ]);
        if (post.mediaPublicId) {
            cloudinary.uploader.destroy(post.mediaPublicId, {
                resource_type: post.mediaResourceType || "image"
            }).catch((error) => console.error("Error deleting post media:", error.message));
        }
        return res.status(200).json({ message: "Post deleted!" });

    } catch (err) {
        console.error("Error deleting the post!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};
const likePost = async (req, res) => {
    const userId = req.user.id;
    const { postId } = req.params;

    try {
        const post = await Post.findOne({
            _id: postId,
            active: true
        });

        if (!post) {
            return res.status(404).json({
                message: "Post not found!"
            });
        }

        const alreadyLiked = post.likedBy.some(
            (likedUserId) =>
                likedUserId.toString() === userId.toString()
        );

        if (alreadyLiked) {
            post.likedBy.pull(userId);
        } else {
            post.likedBy.addToSet(userId);
        }

        await post.save();

        const isOwnPost = post.userId.toString() === userId.toString();
        if (!isOwnPost) {
            if (alreadyLiked) {
                await Notification.deleteOne({
                    recipientId: post.userId,
                    actorId: userId,
                    type: "post_liked",
                    postId: post._id
                });
            } else {
                await Notification.updateOne(
                    {
                        recipientId: post.userId,
                        actorId: userId,
                        type: "post_liked",
                        postId: post._id
                    },
                    {
                        $set: { readAt: null },
                        $setOnInsert: {
                            recipientId: post.userId,
                            actorId: userId,
                            type: "post_liked",
                            postId: post._id
                        }
                    },
                    { upsert: true }
                );
            }
        }

        return res.status(200).json({
            message: alreadyLiked
                ? "Like removed"
                : "Post liked",
            liked: !alreadyLiked,
            likes: post.likedBy.length,
            likedBy: post.likedBy
        });
    } catch (err) {
        console.error("Error updating like:", err.message);

        return res.status(500).json({
            message: "Server error!"
        });
    }
};

const reactWithFace = async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;
    const { reactionId } = req.body;

    try {
        const [post, reaction] = await Promise.all([
            Post.findOne({ _id: postId, active: true }),
            FaceReaction.findOne({ _id: reactionId, ownerId: userId, active: true })
        ]);

        if (!post) {
            return res.status(404).json({ message: "Post not found!" });
        }
        if (!reaction) {
            return res.status(404).json({ message: "Choose a face reaction from your library." });
        }

        post.faceReactions = post.faceReactions.filter(
            (item) => item.userId.toString() !== userId.toString()
        );
        post.faceReactions.push({ userId, reactionId: reaction._id });
        await post.save();

        if (post.userId.toString() !== userId.toString()) {
            await Notification.findOneAndUpdate(
                {
                    recipientId: post.userId,
                    actorId: userId,
                    type: "post_face_reacted",
                    postId: post._id
                },
                {
                    $set: { faceReactionId: reaction._id, readAt: null },
                    $setOnInsert: {
                        recipientId: post.userId,
                        actorId: userId,
                        type: "post_face_reacted",
                        postId: post._id
                    }
                },
                { upsert: true }
            );
        }

        await post.populate("faceReactions.userId", "name username");
        await post.populate("faceReactions.reactionId", "name imageUrl ownerId active");

        return res.status(200).json({
            message: "Face reaction added.",
            faceReactions: post.faceReactions
        });
    } catch (error) {
        console.error("Error adding face reaction:", error.message);
        return res.status(500).json({ message: "Could not add face reaction." });
    }
};

const removeFaceReaction = async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;

    try {
        const post = await Post.findOne({ _id: postId, active: true });
        if (!post) {
            return res.status(404).json({ message: "Post not found!" });
        }

        post.faceReactions = post.faceReactions.filter(
            (item) => item.userId.toString() !== userId.toString()
        );
        await post.save();
        await Notification.deleteOne({
            recipientId: post.userId,
            actorId: userId,
            type: "post_face_reacted",
            postId: post._id
        });
        await post.populate("faceReactions.userId", "name username");
        await post.populate("faceReactions.reactionId", "name imageUrl ownerId active");

        return res.status(200).json({
            message: "Face reaction removed.",
            faceReactions: post.faceReactions
        });
    } catch (error) {
        console.error("Error removing face reaction:", error.message);
        return res.status(500).json({ message: "Could not remove face reaction." });
    }
};

const getTrendingHashtags = async (req, res) => {
    try {
        const posts = await Post.find({ active: true }).select("body").lean();

        const tagMap = new Map();
        const hashtagRegex = /#([a-zA-Z0-9_]+)/g;

        posts.forEach((post) => {
            if (!post.body) return;
            const matches = post.body.match(hashtagRegex);
            if (matches) {
                const uniqueTags = new Set(matches.map((tag) => tag.toLowerCase()));
                uniqueTags.forEach((tag) => {
                    tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
                });
            }
        });

        // If no explicit # hashtags found in database, extract frequent key topics (4+ letters) from real posts
        if (tagMap.size === 0) {
            const stopWords = new Set(["this", "that", "with", "from", "have", "here", "there", "what", "when", "where", "which", "your", "they", "them", "some", "about", "isnt"]);
            posts.forEach((post) => {
                if (!post.body) return;
                const words = post.body.split(/\s+/);
                words.forEach((word) => {
                    const cleanWord = word.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
                    if (cleanWord.length >= 4 && !stopWords.has(cleanWord)) {
                        const tag = `#${cleanWord}`;
                        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
                    }
                });
            });
        }

        const trending = Array.from(tagMap.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 15);

        return res.status(200).json({ trending });

    } catch (err) {
        console.error("Error fetching trending hashtags:", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};

const getPostsByHashtag = async (req, res) => {
    let { tag } = req.params;
    if (!tag) return res.status(400).json({ message: "Tag is required" });

    const searchTag = tag.startsWith("#") ? tag : `#${tag}`;

    try {
        const posts = await Post.find({
            active: true,
            body: { $regex: searchTag, $options: "i" }
        })
            .sort({ createdAt: -1 })
            .populate("userId", "name username email profilePicture")
            .lean();

        const postIds = posts.map((post) => post._id);

        const [liveRooms, commentCounts] = await Promise.all([
            DiscussionRoom.find({
                postId: { $in: postIds },
                status: "live",
            })
                .select("postId title participantCount hostId")
                .lean(),
            Comment.aggregate([
                { $match: { postId: { $in: postIds } } },
                { $group: { _id: "$postId", count: { $sum: 1 } } }
            ])
        ]);

        const roomsByPost = new Map(
            liveRooms.map((room) => [room.postId.toString(), room])
        );
        const countMap = new Map(
            commentCounts.map((c) => [c._id.toString(), c.count])
        );

        const postsWithDetails = posts.map((post) => ({
            ...post,
            commentCount: countMap.get(post._id.toString()) || 0,
            liveDiscussion: roomsByPost.get(post._id.toString()) || null,
        }));

        return res.status(200).json({ posts: postsWithDetails });

    } catch (err) {
        console.error("Error fetching hashtag posts:", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};

const bookmarkPost = async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;

    if (!mongoose.isValidObjectId(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
    }

    try {
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        const isSaved = Array.isArray(post.savedBy) && post.savedBy.some(id => id.toString() === userId.toString());

        const updatedPost = await Post.findByIdAndUpdate(
            postId,
            isSaved
                ? { $pull: { savedBy: userId } }
                : { $addToSet: { savedBy: userId } },
            { returnDocument: 'after' }
        );

        return res.status(200).json({
            message: isSaved ? "Removed from bookmarks" : "Post saved to bookmarks",
            saved: !isSaved,
            savedBy: updatedPost ? updatedPost.savedBy : []
        });
    } catch (err) {
        console.error("Error bookmarking post:", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};

const getSavedPosts = async (req, res) => {
    const userId = req.user.id;

    try {
        const userObjId = mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : userId;
        const posts = await Post.find({
            active: true,
            $or: [{ savedBy: userId }, { savedBy: userObjId }]
        })
            .sort({ createdAt: -1 })
            .populate("userId", "name username email profilePicture")
            .lean();

        const postIds = posts.map((post) => post._id);

        const [liveRooms, commentCounts] = await Promise.all([
            DiscussionRoom.find({
                postId: { $in: postIds },
                status: "live",
            })
                .select("postId title participantCount hostId")
                .lean(),
            Comment.aggregate([
                { $match: { postId: { $in: postIds } } },
                { $group: { _id: "$postId", count: { $sum: 1 } } }
            ])
        ]);

        const roomsByPost = new Map(
            liveRooms.map((room) => [room.postId.toString(), room])
        );
        const countMap = new Map(
            commentCounts.map((c) => [c._id.toString(), c.count])
        );

        const postsWithDetails = posts.map((post) => ({
            ...post,
            commentCount: countMap.get(post._id.toString()) || 0,
            liveDiscussion: roomsByPost.get(post._id.toString()) || null,
        }));

        return res.status(200).json({ posts: postsWithDetails });

    } catch (err) {
        console.error("Error fetching saved posts:", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};

const getPostReactions = async (req, res) => {
    const { postId } = req.params;

    if (!mongoose.isValidObjectId(postId)) {
        return res.status(400).json({ message: "Invalid post." });
    }

    try {
        const post = await Post.findOne({
            _id: postId,
            active: true
        })
            .populate("likedBy", "name username profilePicture")
            .populate("faceReactions.userId", "name username profilePicture")
            .populate("faceReactions.reactionId", "name imageUrl");

        if (!post) {
            return res.status(404).json({ message: "Post not found." });
        }

        const likes = post.likedBy.map((user) => ({
            type: "like",
            user,
            reaction: null
        }));

        const faceReactions = post.faceReactions
            .filter((item) => item.userId && item.reactionId)
            .map((item) => ({
                type: "facemoji",
                user: item.userId,
                reaction: item.reactionId,
                createdAt: item.createdAt
            }));

        const reactions = [...likes, ...faceReactions];

        return res.status(200).json({
            count: reactions.length,
            reactions
        });
    } catch (err) {
        console.error("Error getting post reactions:", err.message);
        return res.status(500).json({ message: "Could not retrieve post reactions." });
    }


};

export default { createPost, getAllPosts, getUploadSignature, deletePost, likePost, reactWithFace, removeFaceReaction, getTrendingHashtags, getPostsByHashtag, bookmarkPost, getSavedPosts,getPostReactions };

import mongoose from "mongoose";
import User from "../models/user.model.js";
import Post from "../models/posts.model.js";
import cloudinary from "../config/cloudinary.js";
import Comment from "../models/comments.model.js";
import Notification from "../models/notification.model.js";
import DiscussionRoom from "../models/discussionRoom.model.js";
import Connection from "../models/connections.model.js";
import { randomUUID } from "crypto";
import FaceReaction from "../models/faceReaction.model.js";
import { rankPosts } from "../services/feedRanking.service.js";

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

        const body = typeof req.body.body === "string" ? req.body.body.trim() : "";

        // Text or media - either alone is a valid post, neither is not.
        if (!body && !mediaUrl) {
            return res.status(400).json({ message: "Add something to post - text, a photo or a video." });
        }

        const post = await Post.create({
            userId,
            body,
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
            .populate({
                path: "repostOf",
                populate: { path: "userId", select: "name username profilePicture" },
            })
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

// Same data as getAllPosts (chronological) - this just re-sorts it by
// rankPosts's score instead of createdAt. Kept as its own endpoint rather
// than changing /allPosts in place, so existing callers are unaffected while
// this is tried out.
const getFeed = async (req, res) => {
    try {
        const posts = await Post.find({ active: true })
            .populate("userId", "name username email profilePicture")
            .populate("faceReactions.userId", "name username")
            .populate("faceReactions.reactionId", "name imageUrl ownerId active")
            .populate({
                path: "repostOf",
                populate: { path: "userId", select: "name username profilePicture" },
            })
            .lean();

        const postIds = posts.map((post) => post._id);

        const [liveRooms, commentCounts, connections] = await Promise.all([
            // participantCount > 0, not just status: "live" - a room's status
            // can go stale (never gets marked ended once everyone leaves), so
            // trusting the flag alone would hand out the live-room ranking
            // boost to a post whose "live" room has been empty for weeks.
            // Requiring an actual current participant is what "live" should
            // mean for ranking purposes, even if the stored status disagrees.
            DiscussionRoom.find({
                postId: { $in: postIds },
                status: "live",
                participantCount: { $gt: 0 },
            })
                .select("postId title participantCount hostId")
                .lean(),
            Comment.aggregate([
                { $match: { postId: { $in: postIds } } },
                { $group: { _id: "$postId", count: { $sum: 1 } } }
            ]),
            Connection.find({
                status: "accepted",
                $or: [
                    { requesterId: req.user.id },
                    { recipientId: req.user.id }
                ]
            })
                .select("requesterId recipientId")
                .lean(),
        ]);

        const roomsByPost = new Map(
            liveRooms.map((room) => [room.postId.toString(), room])
        );
        const countMap = new Map(
            commentCounts.map((c) => [c._id.toString(), c.count])
        );
        // Either side of an accepted connection could be "the other person" -
        // collapse both directions into one set of ids the viewer is
        // connected to, so ranking just does an O(1) membership check per post.
        const connectionUserIds = new Set(
            connections.map((connection) =>
                (connection.requesterId.toString() === req.user.id
                    ? connection.recipientId
                    : connection.requesterId
                ).toString()
            )
        );

        const postsWithDetails = posts.map((post) => ({
            ...post,
            commentCount: countMap.get(post._id.toString()) || 0,
            liveDiscussion: roomsByPost.get(post._id.toString()) || null,
        }));

        const ranked = rankPosts(postsWithDetails, connectionUserIds);

        return res.status(200).json({ count: ranked.length, posts: ranked });

    } catch (err) {
        console.error("Error building ranked feed!", err.message);
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

        // Reposts are their own Posts pointing at this one - without the
        // original they would render as blank cards, so they go with it.
        const repostIds = (await Post.find({ repostOf: post._id }).select("_id").lean())
            .map((repost) => repost._id);
        const postIds = [post._id, ...repostIds];

        await Post.deleteMany({ _id: { $in: postIds } });
        await Promise.all([
            Comment.deleteMany({ postId: { $in: postIds } }),
            Notification.deleteMany({ postId: { $in: postIds } }),
            DiscussionRoom.deleteMany({ postId: { $in: postIds } })
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

// Sharing a post to your own profile. The repost is a new Post you own that
// points at the original, so it appears on your profile and in feeds like any
// other post - while likes and comments stay on the original rather than
// being scattered across every copy.
const repostPost = async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;

    if (!mongoose.isValidObjectId(postId)) {
        return res.status(400).json({ message: "Invalid post." });
    }

    try {
        const original = await Post.findOne({ _id: postId, active: true });
        if (!original) {
            return res.status(404).json({ message: "Post not found." });
        }

        // Reposting a repost should credit the original author, not the
        // person who shared it - otherwise chains of reposts point at each
        // other instead of at the actual content.
        const targetId = original.repostOf || original._id;

        const existing = await Post.findOne({ userId, repostOf: targetId, active: true });
        if (existing) {
            return res.status(409).json({ message: "You already shared this post." });
        }

        const repost = await Post.create({
            userId,
            body: typeof req.body.body === "string" ? req.body.body.trim() : "",
            repostOf: targetId,
        });

        return res.status(201).json({ message: "Shared to your profile.", post: repost });
    } catch (err) {
        // The unique { userId, repostOf } index catches a double-submit that
        // slipped past the findOne check above.
        if (err.code === 11000) {
            return res.status(409).json({ message: "You already shared this post." });
        }
        console.error("Error reposting!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};

const updatePost = async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;
    const body = typeof req.body.body === "string" ? req.body.body.trim() : "";

    if (!mongoose.isValidObjectId(postId)) {
        return res.status(400).json({ message: "Invalid post." });
    }
    if (body.length > 2000) {
        return res.status(400).json({ message: "Posts cannot exceed 2,000 characters." });
    }

    try {
        const post = await Post.findOne({ _id: postId, active: true });
        if (!post) {
            return res.status(404).json({ message: "Post not found." });
        }
        if (post.userId.toString() !== userId.toString()) {
            return res.status(403).json({ message: "You cannot edit this post." });
        }
        // Clearing the caption is fine as long as the post still has media -
        // same "text or media" rule createPost uses.
        if (!body && !post.media) {
            return res.status(400).json({ message: "A post without media needs some text." });
        }

        post.body = body;
        post.editedAt = new Date();
        await post.save();

        return res.status(200).json({ message: "Post updated.", post });
    } catch (error) {
        console.error("Error updating post:", error.message);
        return res.status(500).json({ message: "Could not update post." });
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
            .populate({
                path: "repostOf",
                populate: { path: "userId", select: "name username profilePicture" },
            })
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
            .populate({
                path: "repostOf",
                populate: { path: "userId", select: "name username profilePicture" },
            })
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

export default { createPost, repostPost, getAllPosts, getFeed, getUploadSignature, deletePost, updatePost, likePost, reactWithFace, removeFaceReaction, getTrendingHashtags, getPostsByHashtag, bookmarkPost, getSavedPosts,getPostReactions };

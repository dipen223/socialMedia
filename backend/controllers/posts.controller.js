import User from "../models/user.model.js";
import Post from "../models/posts.model.js";
import cloudinary from "../config/cloudinary.js";
import Comment from "../models/comments.model.js";
import Notification from "../models/notification.model.js";
import { randomUUID } from "crypto";

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
        const posts = await Post.find({ active: true }).populate("userId", "name username email profilePicture");


        return res.status(200).json({ count: posts.length, posts });

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
            Notification.deleteMany({ postId })
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



export default { createPost, getAllPosts, getUploadSignature, deletePost, likePost };

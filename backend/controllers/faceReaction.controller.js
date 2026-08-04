import { randomUUID } from "crypto";
import cloudinary from "../config/cloudinary.js";
import FaceReaction from "../models/faceReaction.model.js";

const MAX_REACTIONS = 8;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;  //5MB

const getUploadSignature = async (req, res) => {
    const fileSize = Number(req.body.fileSize);
    const isImage = req.body.fileType?.startsWith("image/");

    if (!isImage) {
        return res.status(400).json({ message: "Face reactions must be images." });
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_IMAGE_SIZE) {
        return res.status(400).json({ message: "Face reaction images must be smaller than 5 MB." });
    }

    const reactionCount = await FaceReaction.countDocuments({
        ownerId: req.user.id,
        active: true
    });
    if (reactionCount >= MAX_REACTIONS) {
        return res.status(409).json({ message: `You can save up to ${MAX_REACTIONS} face reactions.` });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `ripple/reactions/${req.user.id}/${randomUUID()}`;
    const transformation = "c_fill,g_face,h_256,w_256,r_max,q_auto,f_auto";
    const paramsToSign = { overwrite: false, public_id: publicId, timestamp, transformation };
    const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);

    return res.status(200).json({
        apiKey: process.env.CLOUDINARY_API_KEY,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        overwrite: false,
        publicId,
        resourceType: "image",
        signature,
        timestamp,
        transformation
    });
};

const createReaction = async (req, res) => {
    const name = req.body.name?.trim();
    const publicId = req.body.publicId;
    const expectedPrefix = `ripple/reactions/${req.user.id}/`;

    if (!name || name.length > 24) {
        return res.status(400).json({ message: "Give your reaction a name of 1–24 characters." });
    }
    if (!publicId?.startsWith(expectedPrefix)) {
        return res.status(400).json({ message: "Invalid face reaction upload." });
    }

    try {
        const reactionCount = await FaceReaction.countDocuments({ ownerId: req.user.id, active: true });
        if (reactionCount >= MAX_REACTIONS) {
            return res.status(409).json({ message: `You can save up to ${MAX_REACTIONS} face reactions.` });
        }

        const asset = await cloudinary.api.resource(publicId, { resource_type: "image" });
        if (asset.bytes > MAX_IMAGE_SIZE) {
            await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
            return res.status(400).json({ message: "Uploaded image is too large." });
        }

        const reaction = await FaceReaction.create({
            ownerId: req.user.id,
            name,
            imageUrl: asset.secure_url,
            publicId: asset.public_id
        });
        return res.status(201).json({ message: "Face reaction saved.", reaction });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({ message: "That face reaction is already saved." });
        }
        console.error("Error saving face reaction:", error.message);
        return res.status(500).json({ message: "Could not save face reaction." });
    }
};

const getMyReactions = async (req, res) => {
    const reactions = await FaceReaction.find({ ownerId: req.user.id, active: true })
        .sort({ createdAt: -1 })
        .lean();
    return res.status(200).json({ reactions, limit: MAX_REACTIONS });
};

const deleteReaction = async (req, res) => {
    const reaction = await FaceReaction.findOne({
        _id: req.params.reactionId,
        ownerId: req.user.id,
        active: true
    });
    if (!reaction) {
        return res.status(404).json({ message: "Face reaction not found." });
    }

    // Soft deletion preserves reactions already displayed on posts.
    reaction.active = false;
    await reaction.save();
    return res.status(200).json({ message: "Face reaction removed from your library." });
};

export default { getUploadSignature, createReaction, getMyReactions, deleteReaction };

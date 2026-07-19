import { correctGrammar, generateImage } from "../services/ai.service.js";
import cloudinary from "../config/cloudinary.js";
import { randomUUID } from "crypto";
import Post from "../models/posts.model.js";

const MAX_POST_LENGTH = 2000;
const MAX_IMAGE_PROMPT_LENGTH = 1000;

const getAiErrorResponse = (error, fallbackMessage) => {
    if (error.name === "TimeoutError") {
        return { status: 504, message: "The AI request took too long. Please try again." };
    }

    if (error.code === "moderation_blocked") {
        return { status: 400, message: "That request couldn't be generated. Try a different description." };
    }

    if (error.status === 429) {
        return { status: 429, message: "AI generation is busy right now. Please try again shortly." };
    }

    if (error.status === 503) {
        return { status: 503, message: error.message };
    }

    return { status: 500, message: fallbackMessage };
};

const correctPostGrammar = async (req, res) => {
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";

    if (!text) {
        return res.status(400).json({ message: "Write something before checking the grammar." });
    }

    if (text.length > MAX_POST_LENGTH) {
        return res.status(400).json({ message: `Posts cannot exceed ${MAX_POST_LENGTH} characters.` });
    }

    try {
        const suggestion = await correctGrammar(text);
        return res.status(200).json({ original: text, suggestion });
    } catch (error) {
        console.error("Grammar correction failed:", error.message);

        const result = getAiErrorResponse(error, "We couldn't check the grammar right now. Please try again.");
        return res.status(result.status).json({ message: result.message });
    }
};

const generatePostImage = async (req, res) => {
    const prompt = typeof req.body.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt) {
        return res.status(400).json({ message: "Describe the image you want to create." });
    }

    if (prompt.length > MAX_IMAGE_PROMPT_LENGTH) {
        return res.status(400).json({ message: `Image descriptions cannot exceed ${MAX_IMAGE_PROMPT_LENGTH} characters.` });
    }

    try {
        const imageBase64 = await generateImage(prompt);
        const publicId = `ripple/posts/${req.user.id}/${randomUUID()}`;
        const asset = await cloudinary.uploader.upload(`data:image/png;base64,${imageBase64}`, {
            public_id: publicId,
            overwrite: false,
            resource_type: "image",
            context: {
                ai_generated: "true",
                owner: req.user.id
            }
        });

        const previousPublicId = req.body.previousPublicId;
        if (typeof previousPublicId === "string" && previousPublicId.startsWith(`ripple/posts/${req.user.id}/`)) {
            cloudinary.uploader.destroy(previousPublicId, { resource_type: "image" })
                .catch((error) => console.error("Could not remove replaced AI image:", error.message));
        }

        return res.status(201).json({
            image: {
                url: asset.secure_url,
                publicId: asset.public_id,
                resourceType: "image",
                aiGenerated: true,
                prompt
            }
        });
    } catch (error) {
        console.error("AI image generation failed:", error.message);
        const result = getAiErrorResponse(error, "We couldn't create that image right now. Please try again.");
        return res.status(result.status).json({ message: result.message });
    }
};

const deleteGeneratedImage = async (req, res) => {
    const publicId = typeof req.body.publicId === "string" ? req.body.publicId : "";
    if (!publicId.startsWith(`ripple/posts/${req.user.id}/`)) {
        return res.status(400).json({ message: "Invalid generated image." });
    }

    try {
        const publishedPost = await Post.exists({ mediaPublicId: publicId });
        if (publishedPost) {
            return res.status(409).json({ message: "A published post is using this image." });
        }

        const asset = await cloudinary.api.resource(publicId, { resource_type: "image" });
        if (asset.context?.custom?.ai_generated !== "true" || asset.context?.custom?.owner !== req.user.id) {
            return res.status(403).json({ message: "This generated image does not belong to you." });
        }

        await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
        return res.status(200).json({ message: "Generated image removed." });
    } catch (error) {
        console.error("Could not remove generated image:", error.message);
        return res.status(500).json({ message: "Could not remove the generated image." });
    }
};

export default { correctPostGrammar, generatePostImage, deleteGeneratedImage };

import mongoose, { Schema } from "mongoose";

const postSchema = new Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",

    },
    body: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000

    },
    likedBy: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    ],
    faceReactions: [
        {
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true
            },
            reactionId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "FaceReaction",
                required: true
            },
            createdAt: {
                type: Date,
                default: Date.now
            }
        }
    ],
    savedBy: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    ],
    media: {
        type: String,
        default: ''

    },
    active: {
        type: Boolean,
        default: true,

    },
    fileType: {
        type: String,
        default: ''
    },
    mediaPublicId: {
        type: String,
        default: ''
    },
    mediaResourceType: {
        type: String,
        enum: ['', 'image', 'video'],
        default: ''
    },
    aiGenerated: {
        type: Boolean,
        default: false
    },
    editedAt: {
        type: Date,
        default: null
    }

}, {
    timestamps: true
});


const Post = new mongoose.model("Post", postSchema);

export default Post;

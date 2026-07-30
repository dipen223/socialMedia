import mongoose, { Schema } from "mongoose";

const postSchema = new Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",

    },
    body: {
        type: String,
        required: true

    },
    likedBy: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
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
    }

}, {
    timestamps: true
});


const Post = new mongoose.model("Post", postSchema);

export default Post;

import mongoose, { Schema } from "mongoose";

const postSchema = new Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",

    },
    // Not required: a post needs *content*, which can be media instead of
    // text. A photo, video or reel with no caption is a perfectly normal
    // post. The "must have text or media" rule lives in the controllers,
    // since only they know whether media came through.
    body: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ""
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
    // A repost is its own Post owned by the sharer, pointing back at the
    // original. Keeping it a real Post means it shows on their profile and
    // in feeds with no special-casing; the original keeps its own likes and
    // comments rather than them being split across copies.
    repostOf: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
        default: null
    },
    editedAt: {
        type: Date,
        default: null
    }

}, {
    timestamps: true
});

// The reels feed pages through video posts sorted by _id - this keeps that
// query from scanning every post as the table grows.
postSchema.index({ mediaResourceType: 1, active: 1, _id: -1 });

// One repost of a given post per user, enforced by the database so a
// double-click or two tabs can't create duplicates.
postSchema.index(
    { userId: 1, repostOf: 1 },
    { unique: true, partialFilterExpression: { repostOf: { $type: "objectId" } } }
);


const Post = new mongoose.model("Post", postSchema);

export default Post;

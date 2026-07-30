import mongoose, { Schema } from "mongoose";

const reactionSchema = new Schema(
    {
        emoji: {
            type: String,
            required: true,
            maxlength: 12,
        },
        userIds: [{
            type: Schema.Types.ObjectId,
            ref: "User",
        }],
    },
    { _id: false }
);

const discussionMessageSchema = new Schema(
    {
        roomId: {
            type: Schema.Types.ObjectId,
            ref: "DiscussionRoom",
            required: true,
            index: true,
        },
        senderId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        body: {
            type: String,
            trim: true,
            required: true,
            maxlength: 1000,
        },
        reactions: {
            type: [reactionSchema],
            default: [],
        },
        deletedAt: {
            type: Date,
            default: null,
        },
        deletedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    { timestamps: true }
);

discussionMessageSchema.index({ roomId: 1, createdAt: -1 });

const DiscussionMessage = mongoose.model(
    "DiscussionMessage",
    discussionMessageSchema
);

export default DiscussionMessage;

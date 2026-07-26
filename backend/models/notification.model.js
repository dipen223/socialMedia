import mongoose, { Schema } from "mongoose";

const notificationSchema = new Schema({
    recipientId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    actorId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    type: {
        type: String,
        enum: [
            "connection_request",
            "connection_accepted",
            "post_liked",
            "post_commented",
        ],
        required: true,
    },
    connectionId: {
        type: Schema.Types.ObjectId,
        ref: "Connection",
        default: null,
    },
    postId: {
        type: Schema.Types.ObjectId,
        ref: "Post",
        default: null,
    },
    commentId: {
        type: Schema.Types.ObjectId,
        ref: "Comment",
        default: null,
    },
    readAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true,
});

notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index(
    { recipientId: 1, actorId: 1, type: 1, postId: 1 },
    {
        unique: true,
        partialFilterExpression: { type: "post_liked" },
    }
);
notificationSchema.index(
    { recipientId: 1, type: 1, commentId: 1 },
    {
        unique: true,
        partialFilterExpression: { type: "post_commented" },
    }
);

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;

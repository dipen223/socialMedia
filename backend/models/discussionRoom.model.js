import mongoose, { Schema } from "mongoose";

const discussionRoomSchema = new Schema(
    {
        postId: {
            type: Schema.Types.ObjectId,
            ref: "Post",
            required: true,
            index: true,
        },
        hostId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        title: {
            type: String,
            trim: true,
            maxlength: 100,
            default: "Post discussion",
        },
        status: {
            type: String,
            enum: ["live", "ended"],
            default: "live",
            index: true,
        },
        speakerIds: [{
            type: Schema.Types.ObjectId,
            ref: "User",
        }],
        participantCount: {
            type: Number,
            min: 0,
            default: 0,
        },
        peakParticipantCount: {
            type: Number,
            min: 0,
            default: 0,
        },
        endedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

discussionRoomSchema.index(
    { postId: 1 },
    {
        unique: true,
        partialFilterExpression: { status: "live" },
        name: "one_live_discussion_per_post",
    }
);

const DiscussionRoom = mongoose.model("DiscussionRoom", discussionRoomSchema);

export default DiscussionRoom;

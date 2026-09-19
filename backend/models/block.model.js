import mongoose, { Schema } from "mongoose";

// One row per (blocker, blocked) pair. "block" is mutual in effect - neither
// side can see or contact the other. "mute" is one-sided and silent: the muted
// person is not told, and can still see and message the muter.
const blockSchema = new Schema({
    blockerId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    blockedId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    kind: {
        type: String,
        enum: ["block", "mute"],
        default: "block",
    },
}, {
    timestamps: true,
});

blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
// Lets "who has blocked me" be answered without scanning every row.
blockSchema.index({ blockedId: 1, kind: 1 });

const Block = mongoose.model("Block", blockSchema);

export default Block;

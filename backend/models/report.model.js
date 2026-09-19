import mongoose, { Schema } from "mongoose";

export const REPORT_REASONS = [
    "spam",
    "harassment",
    "hate",
    "violence",
    "nudity",
    "scam",
    "self_harm",
    "other",
];

const reportSchema = new Schema({
    reporterId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    targetType: {
        type: String,
        enum: ["user", "post", "comment"],
        required: true,
    },
    targetId: {
        type: Schema.Types.ObjectId,
        required: true,
    },
    // The person responsible for the content, so reports can be grouped by who
    // keeps getting reported without looking each target up again.
    targetUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    reason: {
        type: String,
        enum: REPORT_REASONS,
        required: true,
    },
    details: {
        type: String,
        trim: true,
        maxlength: 500,
        default: "",
    },
    status: {
        type: String,
        enum: ["open", "reviewed", "dismissed"],
        default: "open",
    },
}, {
    timestamps: true,
});

// One report per person per target - stops a single account flooding the
// queue, and makes a double-click harmless.
reportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ targetUserId: 1 });

const Report = mongoose.model("Report", reportSchema);

export default Report;

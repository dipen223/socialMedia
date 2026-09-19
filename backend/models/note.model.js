import mongoose, { Schema } from "mongoose";

const noteSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    title: {
        type: String,
        trim: true,
        maxlength: 200,
        default: "",
    },
    content: {
        type: String,
        trim: true,
        maxlength: 10000,
        required: true,
    },
    source: {
        type: String,
        enum: ["typed", "voice", "call"],
        default: "typed",
    },
    // Set only for a note taken during a call - lets the notes tab show which
    // conversation/call a note came from without persisting any call audio.
    conversationId: {
        type: Schema.Types.ObjectId,
        ref: "Conversation",
        default: null,
    },
    // Calls aren't their own collection (see sockets/call.socket.js) - just the
    // in-memory callId string, kept here for reference only.
    callId: {
        type: String,
        default: null,
    },
    tags: {
        type: [String],
        default: [],
    },
    pinned: {
        type: Boolean,
        default: false,
    },
    archived: {
        type: Boolean,
        default: false,
    },
    // Reminders extracted (best-effort, by AI) or added from this note's
    // content. dueAt is resolved to an absolute UTC instant at extraction time.
    reminders: {
        type: [
            {
                text: { type: String, required: true, maxlength: 1000 },
                dueAt: { type: Date, required: true },
                notifiedAt: { type: Date, default: null },
            },
        ],
        default: [],
    },
}, {
    timestamps: true,
});

noteSchema.index({ userId: 1, createdAt: -1 });
noteSchema.index({ userId: 1, pinned: -1, createdAt: -1 });
// Powers the reminder poller's due-reminder scan across all users.
noteSchema.index({ "reminders.dueAt": 1, "reminders.notifiedAt": 1 });

const Note = mongoose.model("Note", noteSchema);

export default Note;

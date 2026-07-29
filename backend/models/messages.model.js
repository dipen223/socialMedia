import mongoose,{Schema} from "mongoose";
const messageSchema = new Schema({
    conversationId: {
        type: Schema.Types.ObjectId,
        ref: "Conversation",
        required: true,

    },
    senderId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    body: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: "",
    },
    type: {
        type: String,
        enum: ["text", "image", "video", "audio", "file", "system", "call"],
        default: "text"
    },
    call: {
        type: new Schema(
            {
                mode: {
                    type: String,
                    enum: ["audio", "video"],
                    required: true,
                },
                status: {
                    type: String,
                    enum: ["completed", "missed", "declined", "cancelled"],
                    required: true,
                },
                durationSeconds: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                endedAt: {
                    type: Date,
                    required: true,
                },
                callId: {
                    type: String,
                    default: "",
                },
                summary: {
                    type: new Schema(
                        {
                            status: {
                                type: String,
                                enum: ["pending", "processing", "ready", "failed"],
                                required: true,
                            },
                            requestedBy: {
                                type: Schema.Types.ObjectId,
                                ref: "User",
                                required: true,
                            },
                            consentedBy: [
                                {
                                    type: Schema.Types.ObjectId,
                                    ref: "User",
                                },
                            ],
                            overview: {
                                type: String,
                                default: "",
                            },
                            keyPoints: {
                                type: [String],
                                default: [],
                            },
                            actionItems: {
                                type: [String],
                                default: [],
                            },
                            error: {
                                type: String,
                                default: "",
                            },
                        },
                        { _id: false }
                    ),
                    default: undefined,
                },
            },
            { _id: false }
        ),
        default: undefined,
    },
    attachments: {
        type: [
            {
                _id: false,
                url: { type: String, required: true },
                publicId: { type: String, required: true },
                resourceType: {
                    type: String,
                    enum: ["image", "video", "raw"],
                    required: true,
                },
                fileType: { type: String, default: "" },
                fileName: { type: String, default: "Attachment" },
                bytes: { type: Number, default: 0 },
            },
        ],
        default: [],
    },
    readBy: {
        type: [
            {
                _id: false,
                userId: {
                    type: Schema.Types.ObjectId,
                    ref: "User",
                    required: true,
                },
                readAt:{
                    type:Date,
                    default:Date.now,
                },
            },
        ],
        default:[],
    },
    deliveredTo: {
        type: [
            {
                _id: false,
                userId: {
                    type: Schema.Types.ObjectId,
                    ref: "User",
                    required: true,
                },
                deliveredAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        default: [],
    },
    editedAt: {
        type: Date,
        default: null,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
},
    {
        timestamps: true,
    });


messageSchema.index({ conversationId: 1, createdAt: -1 });


const Message = mongoose.model("Message", messageSchema);
export default Message;

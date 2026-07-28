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
        enum: ["text", "image", "file", "system", "call"],
        default: "text"
    },
    readBy: {
        type: [
            {
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
    }
},
    {
        timestamps: true,
    });


messageSchema.index({ conversationId: 1, createdAt: -1 });


const Message = mongoose.model("Message", messageSchema);
export default Message;
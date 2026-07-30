import mongoose, { Schema } from "mongoose";

const conversationSchema = new Schema({
    members: {
        type: [
            {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,

            },
        ],
        required: true,
        validate: {
            validator: (members) =>
                Array.isArray(members) &&
                new Set(members.map(String)).size >= 2,
            message: "A conversation requires at least two unique members.",
        },
    },
    type: {
        type: String,
        enum: ["direct", "group"],
        default: "direct",
    },
    name: {
        type: String,
        trim: true,
        default: "",
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,

    },
    directKey:{
        type:String,
        default:null,
    },
    lastMessageId:{
        type:Schema.Types.ObjectId,
        ref:"Message",
        default:null,
    }
},

    { timestamps: true });

conversationSchema.index(
  { directKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      directKey: { $type: "string" },
    },
  }
);

conversationSchema.index({ members: 1, updatedAt: -1 });

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;
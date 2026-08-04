import mongoose, { Schema } from "mongoose";

const faceReactionSchema = new Schema({
    ownerId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 24
    },
    imageUrl: {
        type: String,
        required: true
    },
    publicId: {
        type: String,
        required: true,
        unique: true
    },
    active: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

faceReactionSchema.index({ ownerId: 1, createdAt: -1 });

const FaceReaction = mongoose.model("FaceReaction", faceReactionSchema);

export default FaceReaction;

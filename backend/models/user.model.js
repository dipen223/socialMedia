import mongoose, { Schema } from "mongoose";

const userSchema = new Schema({
    name: {
        type: String,
        required: true,
    },
    username: {
        type: String,
        required: true,
        unique: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        default: "",
    },
    googleId: {
        type: String,
        default: null,
    },
    facebookId: {
        type: String,
        default: null,
    },
    authProvider: {
        type: String,
        enum: ["local", "google", "facebook"],
        default: "local",
    },
    preferredLanguage: {
        type: String,
        enum: [
            "en-US", "es-MX", "es-ES", "fr-FR", "de-DE", "it-IT", "pt-BR",
            "ru-RU", "zh-CN", "ja-JP", "ko-KR", "hi-IN", "ne-NP", "bn-BD",
            "ur-PK", "ar-SA", "tr-TR", "vi-VN", "id-ID", "nl-NL", "pl-PL",
        ],
        default: "en-US",
    },
    profilePicture: {
        type: String,
        default: "default.jpg",
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    token: {
        type: String,
        default: "",
    },
});

const User = mongoose.model("User", userSchema);

export default User;

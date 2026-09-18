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
    // Drives which TTS voice stands in for this person when their speech gets
    // translated for a call partner - not shown/used anywhere else.
    voiceGender: {
        type: String,
        enum: ["female", "male"],
        default: "female",
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    token: {
        type: String,
        default: "",
    },
    plan: {
        type: String,
        enum: ["free", "plus"],
        default: "free",
    },
    subscriptionStatus: {
        // Mirrors Stripe subscription status ("active", "past_due", "canceled", ...).
        // null while the user has never subscribed.
        type: String,
        default: null,
    },
    stripeCustomerId: {
        type: String,
        default: null,
    },
    stripeSubscriptionId: {
        type: String,
        default: null,
    },
    currentPeriodEnd: {
        type: Date,
        default: null,
    },
    translationSecondsUsed: {
        type: Number,
        default: 0,
    },
    translationCycleStart: {
        type: Date,
        default: Date.now,
    },
    // Whole minutes already reported to Stripe's usage meter this cycle -
    // only the delta beyond this gets reported, so a chunk never gets billed twice.
    translationOverageMinutesReported: {
        type: Number,
        default: 0,
    },
});

const User = mongoose.model("User", userSchema);

export default User;

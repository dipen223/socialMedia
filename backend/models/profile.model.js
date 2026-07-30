import mongoose, { Schema } from "mongoose";

const profileSchema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  bio: {
    type: String,
    default: "",
  },
  interests: {
    type: [String],
    default: [],
  },
  currentPost: {
    type: String,
    default: "",
  },
  coverPhoto: {
    type: String,
    default: "",
  },
});

const Profile = mongoose.models.Profile || mongoose.model("Profile", profileSchema);

export default Profile;
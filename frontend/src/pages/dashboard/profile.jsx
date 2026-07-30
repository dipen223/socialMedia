import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { clientServer } from "@/config";
import { getUserProfile } from "@/config/redux/action/authAction";
import styles from "@/styles/editProfile.module.css";

const CameraIcon = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0c-.693.037-1.33.428-1.736 1.039l-.822 1.316z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

const initials = (name = "R") =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export default function ProfilePage() {
  const dispatch = useDispatch();
  const avatarInputRef = useRef(null);
  const coverInputRef = useRef(null);

  const authState = useSelector((state) => state.auth.user);
  const user = authState?.userId || authState;

  // Form State
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [currentPost, setCurrentPost] = useState("");
  const [interests, setInterests] = useState("");
  const [coverPhoto, setCoverPhoto] = useState("");

  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Sync state when profile loads
  useEffect(() => {
    if (!authState) return;

    const u = authState.userId || authState;
    setName(u?.name || "");
    setUsername(u?.username || "");
    setEmail(u?.email || "");

    setBio(authState.bio || "");
    setCurrentPost(authState.currentPost || "");
    setCoverPhoto(authState.coverPhoto || "");
    setInterests(
      Array.isArray(authState.interests)
        ? authState.interests.join(", ")
        : authState.interests || ""
    );
  }, [authState]);

  // Handle Profile Picture Upload
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const formData = new FormData();
      formData.append("profilePicture", file);

      await clientServer.post("/update_profile_picture", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      dispatch(getUserProfile());
      setSuccessMsg("Profile picture updated successfully!");
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "Failed to update profile picture."
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Handle Cover Photo Upload
  const handleCoverChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingCover(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const formData = new FormData();
      formData.append("coverPhoto", file);

      const res = await clientServer.post("/update_cover_photo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data?.coverPhoto) {
        setCoverPhoto(res.data.coverPhoto);
      }

      dispatch(getUserProfile());
      setSuccessMsg("Cover photo updated successfully!");
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "Failed to update cover photo."
      );
    } finally {
      setUploadingCover(false);
    }
  };

  // Handle Profile Details Save
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      // 1. Update account details (name, username, email)
      await clientServer.post("/updateAccountInfo", {
        name,
        username,
        email,
      });

      // 2. Update profile bio, currentPost, interests
      const parsedInterests = interests
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      await clientServer.post("/updateProfileDetails", {
        bio,
        currentPost,
        interests: parsedInterests,
      });

      dispatch(getUserProfile());
      setSuccessMsg("Profile updated successfully!");
    } catch (err) {
      console.error("Save profile error:", err);
      setErrorMsg(
        err.response?.data?.message || "Failed to save profile changes."
      );
    } finally {
      setSaving(false);
    }
  };

  const hasAvatar = user?.profilePicture && user.profilePicture !== "default.jpg";

  return (
    <DashboardLayout>
      <div className={styles.page}>
        {/* Hidden File Inputs */}
        <input
          type="file"
          ref={avatarInputRef}
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleAvatarChange}
        />
        <input
          type="file"
          ref={coverInputRef}
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleCoverChange}
        />

        {/* Profile Hero with Cover Photo & Avatar */}
        <section className={styles.profileHero}>
          <div className={styles.coverContainer}>
            {coverPhoto ? (
              <img src={coverPhoto} alt="Cover" className={styles.coverImage} />
            ) : null}
            <button
              className={styles.coverUploadBtn}
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={uploadingCover}
            >
              <CameraIcon />
              <span>{uploadingCover ? "Uploading..." : "Edit Cover Photo"}</span>
            </button>
          </div>

          <div className={styles.heroContent}>
            <div className={styles.avatarWrapper}>
              {hasAvatar ? (
                <img
                  src={user.profilePicture}
                  alt={user.name}
                  className={styles.avatarImage}
                />
              ) : (
                <div className={styles.avatarFallback}>{initials(user?.name)}</div>
              )}
              <div
                className={styles.avatarUploadBtn}
                onClick={() => avatarInputRef.current?.click()}
              >
                <CameraIcon />
                <span>{uploadingAvatar ? "Uploading..." : "Change"}</span>
              </div>
            </div>

            <div className={styles.userMeta}>
              <h2>{user?.name || "User"}</h2>
              <p>@{user?.username || "username"}</p>
              {currentPost && (
                <span className={styles.headlineTag}>{currentPost}</span>
              )}
            </div>
          </div>
        </section>

        {/* Status Notices */}
        {successMsg && (
          <div className={styles.successNotice} role="status">
            ✓ {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className={styles.errorNotice} role="alert">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Edit Form */}
        <form onSubmit={handleSaveProfile} className={styles.formSection}>
          <header className={styles.sectionHeader}>
            <div>
              <h3>Edit Profile Information</h3>
              <p>Update your public profile, bio, role, and skills.</p>
            </div>
          </header>

          <div className={styles.gridTwo}>
            <div className={styles.field}>
              <label htmlFor="name">Full Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dipen Bhandari"
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. dipen123"
                required
              />
            </div>
          </div>

          <div className={styles.gridTwo}>
            <div className={styles.field}>
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="currentPost">Professional Headline / Role</label>
              <input
                id="currentPost"
                type="text"
                value={currentPost}
                onChange={(e) => setCurrentPost(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="bio">About / Bio</label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell your community about yourself, your background, and work..."
              rows={4}
              maxLength={500}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="interests">Interests & Skills (comma separated)</label>
            <input
              id="interests"
              type="text"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="e.g. Coding, Web3, Design, Artificial Intelligence"
            />
          </div>

          <button type="submit" className={styles.saveBtn} disabled={saving}>
            <CheckIcon />
            <span>{saving ? "Saving Changes..." : "Save Profile"}</span>
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { createNewPost, getAllPosts } from "@/config/redux/action/postAction";
import styles from "./CreatePost.module.css";

const PhotoIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9" r="1.5" />
    <path d="m21 15-5-5L5 20" />
  </svg>
);

const VideoIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="6" width="13" height="12" rx="2" />
    <path d="m16 10 5-3v10l-5-3" />
  </svg>
);

export default function CreatePost() {
  const dispatch = useDispatch();
  const fileInputRef = useRef(null);
  const profile = useSelector((state) => state.auth.user);
  const { isCreating, createError } = useSelector((state) => state.posts);
  const [isOpen, setIsOpen] = useState(false);
  const [body, setBody] = useState("");
  const [media, setMedia] = useState(null);
  const user = profile?.userId || profile;
  const hasPicture = user?.profilePicture && user.profilePicture !== "default.jpg";
  const initials = user?.name?.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "SH";
  const previewUrl = useMemo(() => (media ? URL.createObjectURL(media) : ""), [media]);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !isCreating) setIsOpen(false);
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isCreating, isOpen]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const closeModal = () => {
    if (isCreating) return;
    setIsOpen(false);
    setBody("");
    setMedia(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!body.trim()) return;

    try {
      await dispatch(createNewPost({ body: body.trim(), media })).unwrap();
      await dispatch(getAllPosts());
      closeModal();
    } catch {
      // Redux stores the API error and the modal displays it below.
    }
  };

  return (
    <>
      <section className={styles.composer} aria-label="Create a post">
        <div className={styles.startRow}>
          <span className={styles.avatar}>
            {hasPicture ? <img src={user.profilePicture} alt="" /> : initials}
          </span>
          <button className={styles.prompt} type="button" onClick={() => setIsOpen(true)}>
            Do you want to share your thoughts, {user?.name?.split(" ")[0] || "friend"}?
          </button>
        </div>

        <div className={styles.actions}>
          <button type="button" onClick={() => setIsOpen(true)}><PhotoIcon /><span>Photo</span></button>
          <button type="button" onClick={() => setIsOpen(true)}><VideoIcon /><span>Video</span></button>
          <button className={styles.postButton} type="button" onClick={() => setIsOpen(true)}>Create post</button>
        </div>
      </section>

      {isOpen && (
        <div className={styles.overlay} role="presentation" onMouseDown={closeModal}>
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-post-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <h2 id="create-post-title">Create a post</h2>
              <button type="button" aria-label="Close create post" onClick={closeModal}>×</button>
            </header>

            <form onSubmit={handleSubmit}>
              <div className={styles.modalIdentity}>
                <span className={styles.avatar}>
                  {hasPicture ? <img src={user.profilePicture} alt="" /> : initials}
                </span>
                <div><strong>{user?.name || "SocialHub member"}</strong><span>@{user?.username || "member"}</span></div>
              </div>

              <label className={styles.srOnly} htmlFor="post-body">Post text</label>
              <textarea
                id="post-body"
                autoFocus
                maxLength={2000}
                placeholder="What do you want to talk about?"
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />

              {previewUrl && (
                <div className={styles.preview}>
                  {media.type.startsWith("video/") ? <video src={previewUrl} controls /> : <img src={previewUrl} alt="Selected post media preview" />}
                  <button type="button" aria-label="Remove selected media" onClick={() => setMedia(null)}>×</button>
                </div>
              )}

              <div className={styles.modalTools}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  hidden
                  onChange={(event) => setMedia(event.target.files?.[0] || null)}
                />
                <button type="button" onClick={() => fileInputRef.current?.click()}><PhotoIcon />Add media</button>
                <span>{body.length}/2000</span>
              </div>

              {createError && <p className={styles.modalError} role="alert">{createError}</p>}

              <footer className={styles.modalFooter}>
                <button type="button" onClick={closeModal} disabled={isCreating}>Cancel</button>
                <button type="submit" disabled={isCreating || !body.trim()}>{isCreating ? "Posting..." : "Post"}</button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

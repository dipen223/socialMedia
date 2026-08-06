import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import { createNewPost, getAllPosts } from "@/config/redux/action/postAction";
import { correctGrammar, deleteGeneratedImage, generatePostImage } from "@/config/redux/action/aiAction";
import { clearGeneratedImage, clearGrammarSuggestion } from "@/config/redux/reducer/aiReducer";
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

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3c.5 4.6 2.4 6.5 7 7-4.6.5-6.5 2.4-7 7-.5-4.6-2.4-6.5-7-7 4.6-.5 6.5-2.4 7-7Z" />
    <path d="M19 16c.2 1.7.9 2.4 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.1 2.3-.8 2.5-2.5Z" />
  </svg>
);

export default function CreatePost() {
  const dispatch = useDispatch();
  const fileInputRef = useRef(null);
  const profile = useSelector((state) => state.auth.user);
  const { isCreating, createError, uploadProgress } = useSelector((state) => state.posts);
  const {
    original,
    suggestion,
    isCorrecting,
    error: grammarError,
    generatedImage,
    isGeneratingImage,
    imageError,
  } = useSelector((state) => state.ai);
  const [isOpen, setIsOpen] = useState(false);
  const [body, setBody] = useState("");
  const [media, setMedia] = useState(null);
  const [showImageGenerator, setShowImageGenerator] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const user = profile?.userId || profile;
  const hasPicture = user?.profilePicture && user.profilePicture !== "default.jpg";
  const initials = user?.name?.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "R";
  const previewUrl = useMemo(() => (media ? URL.createObjectURL(media) : ""), [media]);
  const displayPreviewUrl = generatedImage?.url || previewUrl;
  const isBusy = isCreating || isCorrecting || isGeneratingImage;

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !isBusy) {
        if (generatedImage?.publicId) dispatch(deleteGeneratedImage(generatedImage.publicId));
        setIsOpen(false);
        setBody("");
        setMedia(null);
        setImagePrompt("");
        setShowImageGenerator(false);
        dispatch(clearGrammarSuggestion());
        dispatch(clearGeneratedImage());
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [dispatch, generatedImage, isBusy, isOpen]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const closeModal = () => {
    if (isBusy) return;
    if (generatedImage?.publicId) dispatch(deleteGeneratedImage(generatedImage.publicId));
    setIsOpen(false);
    setBody("");
    setMedia(null);
    setImagePrompt("");
    setShowImageGenerator(false);
    dispatch(clearGrammarSuggestion());
    dispatch(clearGeneratedImage());
  };

  const handleBodyChange = (event) => {
    setBody(event.target.value);
    if (suggestion || grammarError) dispatch(clearGrammarSuggestion());
  };

  const handleGrammarCheck = async () => {
    const text = body.trim();
    if (!text || isCorrecting) return;

    try {
      await dispatch(correctGrammar(text)).unwrap();
    } catch {
      // Redux stores and displays the user-facing error.
    }
  };

  const acceptGrammarSuggestion = () => {
    setBody(suggestion);
    dispatch(clearGrammarSuggestion());
  };

  const handleGenerateImage = async () => {
    const prompt = imagePrompt.trim();
    if (!prompt || isGeneratingImage) return;

    try {
      await dispatch(generatePostImage({
        prompt,
        previousPublicId: generatedImage?.publicId,
      })).unwrap();
      setMedia(null);
      setImagePrompt("");
      setShowImageGenerator(false);
    } catch {
      // Redux stores and displays the user-facing error.
    }
  };

  const removeSelectedMedia = () => {
    if (generatedImage?.publicId) {
      dispatch(deleteGeneratedImage(generatedImage.publicId));
      dispatch(clearGeneratedImage());
    }
    setMedia(null);
  };

  const handleMediaSelection = (event) => {
    const file = event.target.files?.[0] || null;
    if (file && generatedImage?.publicId) {
      dispatch(deleteGeneratedImage(generatedImage.publicId));
      dispatch(clearGeneratedImage());
    }
    setMedia(file);
    event.target.value = "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!body.trim()) return;

    try {
      await dispatch(createNewPost({ body: body.trim(), media, generatedMedia: generatedImage })).unwrap();
      await dispatch(getAllPosts());
      setIsOpen(false);
      setBody("");
      setMedia(null);
      setImagePrompt("");
      setShowImageGenerator(false);
      dispatch(clearGrammarSuggestion());
      dispatch(clearGeneratedImage());
    } catch {
      // Redux stores the API error and the modal displays it below.
    }
  };

  return (
    <>
      <section className={styles.composer} aria-label="Create a post">
        <div className={styles.startRow}>
          <Link className={styles.avatar} href={user?.username ? `/${user.username}` : "/dashboard/profile"} aria-label="View your profile">
            {hasPicture ? <img src={user.profilePicture} alt="" /> : initials}
          </Link>
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
                onChange={handleBodyChange}
                disabled={isCorrecting}
              />

              <div className={styles.aiTools}>
                <div>
                  <button
                    type="button"
                    onClick={handleGrammarCheck}
                    disabled={!body.trim() || isCorrecting || isCreating}
                  >
                    <SparkleIcon />
                    {isCorrecting ? "Checking grammar…" : "Fix grammar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowImageGenerator((open) => !open)}
                    disabled={isCreating || isGeneratingImage}
                  >
                    <PhotoIcon />
                    {generatedImage ? "Replace AI image" : "Create image"}
                  </button>
                </div>
                <span>AI assistance · You decide what to use</span>
              </div>

              {showImageGenerator && (
                <section className={styles.imageGenerator} aria-labelledby="image-generator-title">
                  <div>
                    <strong id="image-generator-title">Create an image with AI</strong>
                    <span>Low quality · 1024 × 1024</span>
                  </div>
                  <textarea
                    aria-label="Describe the image to generate"
                    maxLength={1000}
                    placeholder="Example: A peaceful green valley at sunrise, cinematic photography"
                    value={imagePrompt}
                    onChange={(event) => setImagePrompt(event.target.value)}
                    disabled={isGeneratingImage}
                  />
                  <footer>
                    <small>{imagePrompt.length}/1000</small>
                    <button type="button" onClick={handleGenerateImage} disabled={!imagePrompt.trim() || isGeneratingImage}>
                      <SparkleIcon />
                      {isGeneratingImage ? "Creating image…" : "Generate and attach"}
                    </button>
                  </footer>
                </section>
              )}

              {imageError && <p className={styles.modalError} role="alert">{imageError}</p>}

              {suggestion && original === body.trim() && (
                <section className={styles.grammarSuggestion} aria-live="polite">
                  <div>
                    <strong>{suggestion === original ? "Your writing already looks good" : "Grammar suggestion"}</strong>
                    <button type="button" onClick={() => dispatch(clearGrammarSuggestion())} aria-label="Dismiss grammar suggestion">×</button>
                  </div>
                  <p>{suggestion}</p>
                  {suggestion !== original && (
                    <footer>
                      <button type="button" onClick={() => dispatch(clearGrammarSuggestion())}>Keep original</button>
                      <button type="button" onClick={acceptGrammarSuggestion}>Use suggestion</button>
                    </footer>
                  )}
                </section>
              )}

              {grammarError && <p className={styles.modalError} role="alert">{grammarError}</p>}

              {displayPreviewUrl && (
                <div className={styles.preview}>
                  {media?.type.startsWith("video/") ? <video src={displayPreviewUrl} controls /> : <img src={displayPreviewUrl} alt={generatedImage ? "AI-generated post preview" : "Selected post media preview"} />}
                  {generatedImage && <span className={styles.aiLabel}>AI-generated</span>}
                  <button type="button" aria-label="Remove selected media" onClick={removeSelectedMedia}>×</button>
                </div>
              )}

              <div className={styles.modalTools}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  hidden
                  onChange={handleMediaSelection}
                />
                <button type="button" onClick={() => fileInputRef.current?.click()}><PhotoIcon />Add media</button>
                <span>{body.length}/2000</span>
              </div>

              {createError && <p className={styles.modalError} role="alert">{createError}</p>}
              {isCreating && media && (
                <div className={styles.uploadStatus} role="status">
                  <span style={{ width: `${uploadProgress}%` }} />
                  <small>{uploadProgress < 100 ? `Uploading media ${uploadProgress}%` : "Finishing your post…"}</small>
                </div>
              )}

              <footer className={styles.modalFooter}>
                <button type="button" onClick={closeModal} disabled={isBusy}>Cancel</button>
                <button type="submit" disabled={isBusy || !body.trim()}>{isCreating ? "Posting…" : "Post"}</button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

import { useState, useRef } from "react";
import axios from "axios";
import { clientServer } from "@/config";
import styles from "./StoryCreator.module.css";

const UploadCloudIcon = () => (
  <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
  </svg>
);

const RefreshIcon = () => (
  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);

const SendIcon = () => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
  </svg>
);

export default function StoryCreator({ onClose, onCreated }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [fileType, setFileType] = useState("video");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");

  const handleFileSelect = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const isVideo = selected.type.startsWith("video/");
    const isImage = selected.type.startsWith("image/");

    if (!isVideo && !isImage) {
      setError("Please select a valid video or image file.");
      return;
    }

    if (isVideo && selected.size > 100 * 1024 * 1024) {
      setError("Videos must be smaller than 100MB.");
      return;
    }

    if (isImage && selected.size > 10 * 1024 * 1024) {
      setError("Images must be smaller than 10MB.");
      return;
    }

    setError("");
    setFile(selected);
    setFileType(isVideo ? "video" : "image");
    setPreviewUrl(URL.createObjectURL(selected));
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError("");
    setUploadProgress(0);

    try {
      const sigRes = await clientServer.post("/media/upload-signature", {
        fileType: file.type,
        fileSize: file.size,
      });

      const {
        apiKey,
        cloudName,
        overwrite,
        publicId,
        resourceType,
        signature,
        timestamp,
      } = sigRes.data;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", apiKey);
      formData.append("timestamp", timestamp);
      formData.append("signature", signature);
      formData.append("public_id", publicId);
      formData.append("overwrite", overwrite);

      const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

      const uploadRes = await axios.post(cloudinaryUrl, formData, {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setUploadProgress(percent);
          }
        },
      });

      const mediaUrl = uploadRes.data.secure_url;
      const mediaPublicId = uploadRes.data.public_id;

      const storyRes = await clientServer.post("/api/stories/create", {
        mediaUrl,
        mediaPublicId,
        mediaResourceType: resourceType,
        caption,
      });

      onCreated?.(storyRes.data.story);
      onClose();
    } catch (err) {
      console.error("Story creation failed:", err);
      setError(
        err.response?.data?.message || err.message || "Failed to post story."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>Add to Story</h3>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          accept="video/*,image/*"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />

        {!previewUrl ? (
          <div
            className={styles.dropzone}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className={styles.uploadIcon}>
              <UploadCloudIcon />
            </div>
            <p>Upload Video or Photo</p>
            <span>Supports MP4/WebM up to 100MB or PNG/JPG up to 10MB</span>
          </div>
        ) : (
          <div className={styles.previewContainer}>
            {fileType === "video" ? (
              <video
                src={previewUrl}
                className={styles.previewMedia}
                controls
                autoPlay
                loop
                muted
              />
            ) : (
              <img
                src={previewUrl}
                alt="Story preview"
                className={styles.previewMedia}
              />
            )}
          </div>
        )}

        <form onSubmit={handleUpload} className={styles.form}>
          {previewUrl && (
            <textarea
              placeholder="Add a caption to your story..."
              maxLength={200}
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          )}

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            {previewUrl && (
              <button
                type="button"
                className={styles.changeMediaBtn}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <RefreshIcon />
                <span>Change File</span>
              </button>
            )}
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={uploading}
            >
              Cancel
            </button>
            {previewUrl && (
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={uploading}
              >
                <SendIcon />
                <span>
                  {uploading
                    ? `Posting (${uploadProgress}%)...`
                    : "Share Story"}
                </span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

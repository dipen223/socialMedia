import { useEffect } from "react";
import styles from "./MediaLightbox.module.css";

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function MediaLightbox({ src, alt = "Media preview", isVideo = false, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!src) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <button
        type="button"
        className={styles.closeBtnFloating}
        onClick={onClose}
        aria-label="Close preview"
        title="Close (Esc)"
      >
        <CloseIcon />
      </button>

      <div className={styles.mediaContainer} onClick={(e) => e.stopPropagation()}>
        {isVideo ? (
          <video className={styles.video} src={src} controls autoPlay preload="metadata" />
        ) : (
          <img className={styles.image} src={src} alt={alt} />
        )}
      </div>
    </div>
  );
}

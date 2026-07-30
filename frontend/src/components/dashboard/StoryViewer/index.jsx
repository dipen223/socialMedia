import { useState, useEffect, useRef, useCallback } from "react";
import { clientServer } from "@/config";
import styles from "./StoryViewer.module.css";

const SpeakerVolumeIcon = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.287a5.25 5.25 0 010 7.426M12.553 3.376A1.5 1.5 0 0010.5 4.5v15a1.5 1.5 0 002.053 1.124l4.316-2.158a1.5 1.5 0 00.831-1.342V6.876a1.5 1.5 0 00-.831-1.342l-4.316-2.158z" />
  </svg>
);

const SpeakerMuteIcon = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-2.36a1.5 1.5 0 012.28 1.341v10.038a1.5 1.5 0 01-2.28 1.341L6.75 14.25H4.5A2.25 2.25 0 012.25 12v-1.5a2.25 2.25 0 012.25-2.25h2.25z" />
  </svg>
);

const EyeIcon = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12c.077-.19.152-.375.228-.553A12.593 12.593 0 0112 4.5c4.686 0 8.798 2.5 10.236 6.947.076.178.151.363.228.553a12.594 12.594 0 01-10.236 6.947c-4.686 0-8.798-2.5-10.236-6.947z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const HeartIcon = ({ filled = false }) => (
  <svg width="16" height="16" fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
  </svg>
);

const formatTimeAgo = (dateStr) => {
  const diffMinutes = Math.floor((new Date() - new Date(dateStr)) / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours}h ago`;
};

const initials = (name = "R") =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export default function StoryViewer({
  storyGroups,
  initialGroupIndex = 0,
  initialStoryIndex = 0,
  onClose,
  onAddStory,
  currentUser,
}) {
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(initialStoryIndex);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [viewsCount, setViewsCount] = useState(0);

  const videoRef = useRef(null);
  const timerRef = useRef(null);

  const currentGroup = storyGroups[groupIndex];
  const currentStory = currentGroup?.stories?.[storyIndex];

  const currentUserId = currentUser?._id?.toString() || currentUser?.id?.toString();

  useEffect(() => {
    if (!currentStory) return;

    setProgress(0);
    const userIdList = currentStory.likes || [];
    setIsLiked(
      userIdList.some(
        (id) => (id._id?.toString() || id.toString()) === currentUserId
      )
    );
    setLikesCount(currentStory.likes?.length || 0);
    setViewsCount(currentStory.viewers?.length || 0);

    clientServer
      .post(`/api/stories/${currentStory._id}/view`)
      .then((res) => {
        if (res.data?.viewersCount) {
          setViewsCount(res.data.viewersCount);
        }
      })
      .catch(() => {});
  }, [currentStory, currentUserId]);

  const handleNext = useCallback(() => {
    if (!currentGroup) return;

    if (storyIndex < currentGroup.stories.length - 1) {
      setStoryIndex((prev) => prev + 1);
    } else if (groupIndex < storyGroups.length - 1) {
      setGroupIndex((prev) => prev + 1);
      setStoryIndex(0);
    } else {
      setTimeout(() => onClose?.(), 0);
    }
  }, [currentGroup, storyIndex, groupIndex, storyGroups.length, onClose]);

  const handlePrev = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex((prev) => prev - 1);
    } else if (groupIndex > 0) {
      const prevGroupIndex = groupIndex - 1;
      setGroupIndex(prevGroupIndex);
      setStoryIndex(storyGroups[prevGroupIndex].stories.length - 1);
    }
  }, [storyIndex, groupIndex, storyGroups]);

  useEffect(() => {
    if (!currentStory || isPaused) return;

    const DURATION_MS = currentStory.mediaResourceType === "video" ? 10000 : 5000;
    const intervalMs = 50;

    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (intervalMs / DURATION_MS) * 100;
        if (next >= 100) {
          clearInterval(timerRef.current);
          handleNext();
          return 0;
        }
        return next;
      });
    }, intervalMs);

    return () => clearInterval(timerRef.current);
  }, [currentStory, isPaused, handleNext]);

  const toggleLike = async () => {
    if (!currentStory) return;

    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setLikesCount((prev) => (newLiked ? prev + 1 : prev - 1));

    try {
      await clientServer.post(`/api/stories/${currentStory._id}/like`);
    } catch {
      setIsLiked(!newLiked);
      setLikesCount((prev) => (newLiked ? prev - 1 : prev + 1));
    }
  };

  if (!currentGroup || !currentStory) return null;

  const isVideo = currentStory.mediaResourceType === "video";
  const author = currentGroup.user;
  const isOwner = (author?._id?.toString() || author?.id?.toString()) === currentUserId;

  return (
    <div className={styles.overlay}>
      <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
        ×
      </button>

      <div
        className={styles.stage}
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        <div className={styles.topOverlay}>
          <div className={styles.progressSegments}>
            {currentGroup.stories.map((s, idx) => (
              <div key={s._id} className={styles.segment}>
                <div
                  className={`${styles.segmentFill} ${
                    idx < storyIndex ? styles.completed : ""
                  }`}
                  style={{
                    width:
                      idx === storyIndex
                        ? `${progress}%`
                        : idx < storyIndex
                        ? "100%"
                        : "0%",
                  }}
                />
              </div>
            ))}
          </div>

          <div className={styles.userInfo}>
            <div className={styles.author}>
              {author?.profilePicture && author.profilePicture !== "default.jpg" ? (
                <img
                  src={author.profilePicture}
                  alt=""
                  className={styles.avatar}
                />
              ) : (
                <div className={styles.avatarFallback}>
                  {initials(author?.name)}
                </div>
              )}
              <div className={styles.authorMeta}>
                <strong>{author?.name || author?.username}</strong>
                <span>{formatTimeAgo(currentStory.createdAt)}</span>
              </div>
            </div>

            <div className={styles.topControls}>
              {isOwner && (
                <button
                  className={styles.addMoreBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose?.();
                    onAddStory?.();
                  }}
                >
                  + Add Story
                </button>
              )}

              {isVideo && (
                <button
                  className={styles.soundToggle}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMuted(!isMuted);
                  }}
                  aria-label="Toggle Mute"
                >
                  {isMuted ? <SpeakerMuteIcon /> : <SpeakerVolumeIcon />}
                </button>
              )}
            </div>
          </div>
        </div>

        <div
          className={styles.navTouchLeft}
          onClick={(e) => {
            e.stopPropagation();
            handlePrev();
          }}
        />
        <div
          className={styles.navTouchRight}
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
        />

        <div className={styles.mediaContainer}>
          <div
            className={styles.blurBackground}
            style={{ backgroundImage: `url(${currentStory.mediaUrl})` }}
          />

          {isVideo ? (
            <video
              ref={videoRef}
              src={currentStory.mediaUrl}
              className={styles.media}
              autoPlay
              playsInline
              muted={isMuted}
              loop
            />
          ) : (
            <img
              src={currentStory.mediaUrl}
              alt=""
              className={styles.media}
            />
          )}
        </div>

        <div className={styles.bottomOverlay}>
          {currentStory.caption && (
            <p className={styles.caption}>{currentStory.caption}</p>
          )}

          <div className={styles.footerActions}>
            <div className={styles.viewerCount}>
              <EyeIcon />
              <span>{viewsCount} view{viewsCount === 1 ? "" : "s"}</span>
            </div>

            <button
              className={`${styles.likeBtn} ${isLiked ? styles.liked : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleLike();
              }}
            >
              <HeartIcon filled={isLiked} />
              <span>{likesCount}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

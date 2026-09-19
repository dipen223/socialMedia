import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { likePost } from "@/config/redux/action/postAction";
import FaceReactionPicker from "@/components/dashboard/FaceReactionPicker";
import styles from "./ReelCard.module.css";

const LikeIcon = ({ filled = false }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"}>
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8Z" />
  </svg>
);

const CommentIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-4-.9L3 21l1.9-5a8.4 8.4 0 0 1-.9-4 8.4 8.4 0 0 1 8.4-8.4h.6A8.4 8.4 0 0 1 21 11v.5Z" />
  </svg>
);

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
    <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v14" />
  </svg>
);

const MutedIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
    <path d="M11 5 6 9H2v6h4l5 4V5ZM23 9l-6 6M17 9l6 6" />
  </svg>
);

const SoundIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
    <path d="M11 5 6 9H2v6h4l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

export default function ReelCard({ reel, muted, onToggleMute, onShare, onRepost }) {
  const dispatch = useDispatch();
  const router = useRouter();
  const videoRef = useRef(null);
  const [isPaused, setIsPaused] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [faceReactions, setFaceReactions] = useState(reel.faceReactions || []);
  // Reels live in the page's local state, not redux's state.posts, so the
  // like result has to be kept here for the heart and count to update.
  const [likedBy, setLikedBy] = useState(reel.likedBy || []);

  const currentUser = useSelector((state) => state.auth.user);
  const me = currentUser?.userId || currentUser;
  const author = reel.userId;

  const likeCount = likedBy.length;
  const isLiked = Boolean(me?._id && likedBy.some((id) => (id?._id || id)?.toString() === me._id));
  const currentFaceReaction = faceReactions.find(
    (reaction) => (reaction.userId?._id || reaction.userId)?.toString() === me?._id
  );

  // Autoplay whichever reel is actually on screen. IntersectionObserver fires
  // only when visibility crosses the threshold, rather than recomputing
  // positions on every scroll event like a scroll listener would.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // play() rejects if the browser blocks autoplay - harmless here,
          // the poster stays up and the user can tap to start it.
          video.play().catch(() => {});
          setIsPaused(false);
        } else {
          video.pause();
          video.currentTime = 0;
          setIsPaused(false);
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  // Browsers only allow autoplay while muted, so mute is driven by the feed's
  // shared state rather than the video element's own default.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setIsPaused(false);
    } else {
      video.pause();
      setIsPaused(true);
    }
  };

  const handleLike = async () => {
    try {
      const result = await dispatch(likePost(reel._id)).unwrap();
      setLikedBy(result.likedBy || []);
    } catch {
      // The failure is already recorded in redux (likeError) - keep the
      // current heart state.
    }
  };

  const profileHref = author?.username ? `/${author.username}` : "/dashboard/profile";
  const hasPicture = author?.profilePicture && author.profilePicture !== "default.jpg";
  const initials =
    author?.name?.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "R";

  return (
    <section className={styles.slide}>
      {/* Landscape clips sit letterboxed in a tall frame - a blurred, dimmed
          copy of the poster fills the empty space instead of flat black. */}
      {reel.thumbnailUrl && (
        <div
          className={styles.backdrop}
          style={{ backgroundImage: `url(${reel.thumbnailUrl})` }}
          aria-hidden="true"
        />
      )}
      <video
        ref={videoRef}
        className={styles.video}
        src={reel.playbackUrl}
        poster={reel.thumbnailUrl || undefined}
        playsInline
        loop
        muted={muted}
        preload="metadata"
        onClick={togglePlayback}
      />

      {isPaused && (
        <button type="button" className={styles.playOverlay} onClick={togglePlayback} aria-label="Play">
          <PlayIcon />
        </button>
      )}

      <button
        type="button"
        className={styles.muteButton}
        onClick={onToggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <MutedIcon /> : <SoundIcon />}
      </button>

      <div className={styles.actions}>
        <button
          type="button"
          className={isLiked ? styles.actionActive : styles.action}
          onClick={handleLike}
          aria-label={isLiked ? "Unlike" : "Like"}
          aria-pressed={isLiked}
        >
          <LikeIcon filled={isLiked} />
          <span>{likeCount}</span>
        </button>

        <div className={styles.action}>
          <FaceReactionPicker
            postId={reel._id}
            currentReaction={currentFaceReaction}
            reactionCount={faceReactions.length}
            onChange={setFaceReactions}
          />
        </div>

        <button
          type="button"
          className={styles.action}
          onClick={() => router.push(`/dashboard/posts/${reel._id}`)}
          aria-label="Comments"
        >
          <CommentIcon />
          <span>{reel.commentCount || 0}</span>
        </button>

        <div className={styles.shareWrap}>
          <button
            type="button"
            className={styles.action}
            onClick={() => setShareOpen((open) => !open)}
            aria-label="Share"
            aria-expanded={shareOpen}
          >
            <ShareIcon />
          </button>

          {shareOpen && (
            <div className={styles.shareMenu}>
              <button
                type="button"
                onClick={() => {
                  setShareOpen(false);
                  onRepost(reel);
                }}
              >
                Repost to my profile
              </button>
              <button
                type="button"
                onClick={() => {
                  setShareOpen(false);
                  onShare(reel);
                }}
              >
                Send link
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.meta}>
        <Link href={profileHref} className={styles.author}>
          <span className={styles.avatar}>
            {hasPicture ? <img src={author.profilePicture} alt="" /> : initials}
          </span>
          <span className={styles.names}>
            <strong>{author?.name || "SocialHub member"}</strong>
            <small>@{author?.username || "member"}</small>
          </span>
        </Link>
        {reel.body && <p className={styles.caption}>{reel.body}</p>}
      </div>
    </section>
  );
}

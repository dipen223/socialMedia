import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/router";
import Link from "next/link";
import { deletePost, likePost } from "@/config/redux/action/postAction";
import { createNewComment, getCommentsByPost } from "@/config/redux/action/commentAction";
import ConnectButton from "@/components/dashboard/ConnectionButton";
import { clientServer } from "@/config";
import { getSocket } from "@/config/socket";
import styles from "./PostCard.module.css";

const LikeIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" />
  </svg>
);

const CommentIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
  </svg>
);

const ShareIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
  </svg>
);

const RoomIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.7" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 10.5a3.75 3.75 0 1 1 7.5 0v3a3.75 3.75 0 1 1-7.5 0v-3Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 13.5a6.75 6.75 0 0 0 13.5 0M12 20.25V22m-3 0h6" />
  </svg>
);


const MoreIcon = () => (
  <svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="5" cy="12" r="1.75" />
    <circle cx="12" cy="12" r="1.75" />
    <circle cx="19" cy="12" r="1.75" />
  </svg>
);

const SaveIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 16.5 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
  </svg>
);

const DeleteIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
  </svg>
);

const HideIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.52 10.52 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243" />
  </svg>
);

const ReportIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18m0-16.5h11.25l-1.5 3 1.5 3H3" />
  </svg>
);

const formatPostDate = (createdAt) => {
  if (!createdAt) return "Recently";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: new Date(createdAt).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  }).format(new Date(createdAt));
};

const formatCommentDate = (createdAt) => {
  if (!createdAt) return "Recently";

  const createdDate = new Date(createdAt);
  if (Number.isNaN(createdDate.getTime())) return "Recently";

  const elapsedMinutes = Math.floor((Date.now() - createdDate.getTime()) / 60000);
  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  if (elapsedMinutes < 1440) return `${Math.floor(elapsedMinutes / 60)}h ago`;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: createdDate.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  }).format(createdDate);
};

export default function PostCard({ post, detail = false }) {
  const dispatch = useDispatch();
  const router = useRouter();
  const menuRef = useRef(null);
  const commentsRequestedRef = useRef(false);
  const profile = useSelector((state) => state.auth.user);
  const { deletingPostId, likingPostId } = useSelector((state) => state.posts);
  const comments = useSelector(
    (state) => state.comments.commentsByPost[post._id] || []
  );
  const { creatingForPostId, fetchedPostIds, loadingForPostId } = useSelector((state) => state.comments);
  const currentUser = profile?.userId || profile;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [removedReason, setRemovedReason] = useState("");
  const [notice, setNotice] = useState("");
  const [showComments, setShowComments] = useState(detail);
  const [commentText, setCommentText] = useState("");
  const [liveDiscussion, setLiveDiscussion] = useState(post.liveDiscussion || null);
  const [startingDiscussion, setStartingDiscussion] = useState(false);
  const author = post.userId;
  const hasPicture = author?.profilePicture && author.profilePicture !== "default.jpg";
  const initials = author?.name?.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "S";
  const isVideo = post.fileType?.startsWith("video/");
  const isOwner = author?._id?.toString() === currentUser?._id?.toString();
  const isLiked = post.likedBy?.some(
    (userId) => userId.toString() === currentUser?._id?.toString()
  ) || false;
  const likeCount = post.likedBy?.length || 0;
  const isLiking = likingPostId === post._id;
  const isDeleting = deletingPostId === post._id;
  const isCreatingComment = creatingForPostId === post._id;
  const isLoadingComments = loadingForPostId === post._id;
  const currentUserInitial = currentUser?.name?.[0]?.toUpperCase() || "Y";
  const authorHref = author?.username ? `/${author.username}` : null;

  useEffect(() => {
    const closeMenu = (event) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        setShowDeleteConfirm(false);
      }

      if (event.type === "mousedown" && !menuRef.current?.contains(event.target)) {
        setIsMenuOpen(false);
        setShowDeleteConfirm(false);
      }
    };

    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeMenu);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeMenu);
    };
  }, []);

  useEffect(() => {
    if (detail && !fetchedPostIds[post._id] && !commentsRequestedRef.current) {
      commentsRequestedRef.current = true;
      dispatch(getCommentsByPost(post._id));
    }
  }, [detail, dispatch, fetchedPostIds, post._id]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const handleStarted = ({ postId, roomId }) => {
      if (postId === post._id) {
        setLiveDiscussion((current) => current || {
          _id: roomId,
          title: "Live post discussion",
          participantCount: 0,
        });
      }
    };
    const handleClosed = ({ postId }) => {
      if (postId === post._id) setLiveDiscussion(null);
    };
    socket.on("discussion:started", handleStarted);
    socket.on("discussion:closed", handleClosed);
    return () => {
      socket.off("discussion:started", handleStarted);
      socket.off("discussion:closed", handleClosed);
    };
  }, [post._id]);

  const closeAfter = (callback) => {
    callback();
    setIsMenuOpen(false);
  };

  const addComment = async (event) => {
    event.preventDefault();
    const body = commentText.trim();
    if (!body || isCreatingComment) return;

    try {
      await dispatch(createNewComment({ postId: post._id, body })).unwrap();
      setCommentText("");
    } catch (error) {
      setNotice(error || "Could not post comment.");
    }
  };

  const toggleComments = () => {
    if (!detail) {
      router.push(`/dashboard/posts/${post._id}`);
      return;
    }

    const willOpen = !showComments;
    setShowComments(willOpen);

    if (willOpen && !fetchedPostIds[post._id] && !isLoadingComments) {
      dispatch(getCommentsByPost(post._id));
    }
  };

  const sharePost = async () => {
    const url = `${window.location.origin}${window.location.pathname}#post-${post._id}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "Ripple post", text: post.body, url });
        return;
      }

      await navigator.clipboard.writeText(url);
      setNotice("Post link copied to your clipboard.");
    } catch (error) {
      if (error.name !== "AbortError") setNotice("Could not share this post.");
    }
  };

  const handleLike = async () => {
    try {
      await dispatch(likePost(post._id)).unwrap();
    } catch (error) {
      setNotice(error || "Could not update like.");
    }
  };

  const openDiscussion = async () => {
    if (liveDiscussion?._id) {
      router.push(`/dashboard/discussions/${liveDiscussion._id}`);
      return;
    }
    if (!isOwner || startingDiscussion) return;

    setStartingDiscussion(true);
    try {
      const response = await clientServer.post(`/posts/${post._id}/discussion-room`);
      setLiveDiscussion(response.data.room);
      router.push(`/dashboard/discussions/${response.data.room._id}`);
    } catch (error) {
      setNotice(error.response?.data?.message || "Could not start the discussion.");
    } finally {
      setStartingDiscussion(false);
    }
  };

  if (removedReason) {
    return (
      <div className={styles.removedNotice} role="status">
        <span>{removedReason}</span>
        <button type="button" onClick={() => setRemovedReason("")}>Undo</button>
      </div>
    );
  }

  const handleDelete = async () => {
    try {
      await dispatch(deletePost(post._id)).unwrap();
    } catch (error) {
      setShowDeleteConfirm(false);
      setIsMenuOpen(false);
      setNotice(error || "Could not delete this post.");
    }
  };

  return (
    <article className={styles.card} id={`post-${post._id}`}>
      <header className={styles.header}>
        {authorHref ? (
          <Link className={styles.avatar} href={authorHref} aria-label={`View ${author.name}'s profile`}>
            {hasPicture ? <img src={author.profilePicture} alt="" /> : initials}
          </Link>
        ) : (
          <span className={styles.avatar}>{hasPicture ? <img src={author.profilePicture} alt="" /> : initials}</span>
        )}

        <div className={styles.authorDetails}>
          {authorHref ? (
            <Link href={authorHref}>
              <strong>{author?.name || "Ripple member"}</strong>
              <span>@{author.username}</span>
            </Link>
          ) : (
            <><strong>{author?.name || "Ripple member"}</strong><span>@member</span></>
          )}
          <small>{formatPostDate(post.createdAt)} · Public</small>
        </div>

        {detail && !isOwner && (
          <ConnectButton
            userId={author?._id}
            className={styles.connectButton}
          />
        )}

        <div className={styles.menuWrap} ref={menuRef}>
          <button
            className={styles.moreButton}
            type="button"
            aria-label="Post options"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <MoreIcon />
          </button>

          {isMenuOpen && (
            <div className={styles.menu} role="menu">
              {showDeleteConfirm ? (
                <div className={styles.deleteConfirm}>
                  <strong>Delete this post?</strong>

                  <div>
                    <button type="button" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                    <button type="button" disabled={isDeleting} onClick={handleDelete}>
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button role="menuitem" type="button" onClick={() => closeAfter(() => setIsSaved((saved) => !saved))}>
                    <span className={styles.menuIcon}><SaveIcon /></span>
                    <strong>{isSaved ? "Unsave" : "Save"}</strong>
                  </button>

                  {isOwner ? (
                    <button className={styles.dangerOption} role="menuitem" type="button" onClick={() => setShowDeleteConfirm(true)}>
                      <span className={styles.menuIcon}><DeleteIcon /></span>
                      <strong>Delete</strong>
                    </button>
                  ) : (
                    <>
                      <button role="menuitem" type="button" onClick={() => closeAfter(() => setRemovedReason("Post hidden from this view."))}>
                        <span className={styles.menuIcon}><HideIcon /></span>
                        <strong>Hide</strong>
                      </button>
                      <button role="menuitem" type="button" onClick={() => closeAfter(() => setNotice("Thanks. Your report choice was recorded locally."))}>
                        <span className={styles.menuIcon}><ReportIcon /></span>
                        <strong>Report</strong>
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

      </header>

      {notice && <div className={styles.inlineNotice} role="status">{notice}<button type="button" onClick={() => setNotice("")}>×</button></div>}

      <p className={styles.body}>{post.body}</p>

      {post.media && (
        <div className={styles.mediaWrap}>
          {isVideo ? (
            <video className={styles.media} src={post.media} controls preload="metadata" />
          ) : (
            <img className={styles.media} src={post.media} alt="Post attachment" />
          )}
          {post.aiGenerated && <span className={styles.aiMediaLabel}>AI-generated</span>}
        </div>
      )}

      <footer className={styles.footer}>
        {(liveDiscussion || isOwner) && (
          <button
            className={`${styles.discussionCta} ${liveDiscussion ? styles.discussionLive : ""}`}
            type="button"
            onClick={openDiscussion}
            disabled={startingDiscussion}
          >
            <span className={styles.discussionIcon}><RoomIcon /></span>
            <span className={styles.discussionCopy}>
              <strong>
                {liveDiscussion
                  ? liveDiscussion.title || "Live post discussion"
                  : "Start a live discussion"}
              </strong>
              <small>
                {liveDiscussion
                  ? `${liveDiscussion.participantCount || 0} listening now`
                  : "Open an audio room around this post"}
              </small>
            </span>
            <span className={styles.discussionAction}>
              {startingDiscussion ? "Starting…" : liveDiscussion ? "Join room" : "Go live"}
            </span>
          </button>
        )}
        <div className={styles.actionBar}>
          <button
            className={isLiked ? styles.activeAction : ""}
            type="button"
            aria-label={`${isLiked ? "Unlike" : "Like"} post. ${likeCount} ${likeCount === 1 ? "like" : "likes"}`}
            aria-pressed={isLiked}
            aria-busy={isLiking}
            disabled={isLiking}
            onClick={handleLike}
          >
            <LikeIcon /> <span>{likeCount}</span>
          </button>
          <button
            type="button"
            aria-label={`Open comments. ${comments.length} ${comments.length === 1 ? "comment" : "comments"}`}
            aria-expanded={showComments}
            onClick={toggleComments}
          >
            <CommentIcon /> <span>{comments.length}</span>
          </button>
          <button type="button" onClick={sharePost}>
            <ShareIcon /> Share
          </button>
        </div>

        {showComments && (
          <div className={styles.commentPanel}>
            {isLoadingComments && <p role="status">Loading comments...</p>}
            {comments.length > 0 && (
              <ul className={styles.commentList}>
                {comments.map((comment) => (
                  <li key={comment._id}>
                    {comment.userId?.username ? (
                      <Link className={styles.commentAvatar} href={`/${comment.userId.username}`} aria-label={`View ${comment.userId.name}'s profile`}>
                        {comment.userId.name?.[0]?.toUpperCase() || "R"}
                      </Link>
                    ) : (
                      <span className={styles.commentAvatar}>{currentUserInitial}</span>
                    )}
                    <div>
                      {comment.userId?.username ? (
                        <Link className={styles.commentAuthor} href={`/${comment.userId.username}`}>{comment.userId.name || "Ripple member"}</Link>
                      ) : (
                        <strong>{comment.userId?.name || "Ripple member"}</strong>
                      )}
                      <p>{comment.body}</p>
                      <small>{formatCommentDate(comment.createdAt)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <form className={styles.commentForm} onSubmit={addComment}>
              <span className={styles.commentAvatar}>{currentUserInitial}</span>
              <label className={styles.srOnly} htmlFor={`comment-${post._id}`}>Write a comment</label>
              <input id={`comment-${post._id}`} value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Write a comment..." maxLength={500} />
              <button type="submit" disabled={!commentText.trim() || isCreatingComment}>
                {isCreatingComment ? "Posting..." : "Post"}
              </button>
            </form>
          </div>
        )}
      </footer>
    </article>
  );
}

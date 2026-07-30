import { useState, useEffect, useCallback } from "react";
import { useSelector } from "react-redux";
import { clientServer } from "@/config";
import StoryCreator from "../StoryCreator";
import StoryViewer from "../StoryViewer";
import styles from "./StoriesBar.module.css";

const initials = (name = "R") =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export default function StoriesBar() {
  const profile = useSelector((state) => state.auth.user);
  const currentUser = profile?.userId || profile;

  const [storyGroups, setStoryGroups] = useState([]);
  const [showCreator, setShowCreator] = useState(false);
  const [activeViewerGroupIndex, setActiveViewerGroupIndex] = useState(null);

  const fetchActiveStories = useCallback(async () => {
    try {
      const res = await clientServer.get("/api/stories/active");
      if (res.data?.storyGroups) {
        setStoryGroups(res.data.storyGroups);
      }
    } catch (err) {
      console.error("Could not fetch active stories:", err);
    }
  }, []);

  useEffect(() => {
    fetchActiveStories();
  }, [fetchActiveStories]);

  const handleStoryCreated = () => {
    fetchActiveStories();
  };

  const currentUserId = currentUser?._id?.toString() || currentUser?.id?.toString();
  const currentUserGroup = storyGroups.find(
    (g) => (g.user?._id?.toString() || g.user?.id?.toString()) === currentUserId
  );

  return (
    <>
      <div className={styles.container}>
        {/* Your Story Add / View Button */}
        <div className={styles.item}>
          <div className={`${styles.ring} ${styles.add}`}>
            <div
              onClick={() => {
                if (currentUserGroup && currentUserGroup.stories.length > 0) {
                  const idx = storyGroups.indexOf(currentUserGroup);
                  setActiveViewerGroupIndex(idx);
                } else {
                  setShowCreator(true);
                }
              }}
              style={{ width: "100%", height: "100%" }}
            >
              {currentUser?.profilePicture && currentUser.profilePicture !== "default.jpg" ? (
                <img src={currentUser.profilePicture} alt="" className={styles.avatar} />
              ) : (
                <div className={styles.fallbackAvatar}>{initials(currentUser?.name)}</div>
              )}
            </div>
            <span
              className={styles.addBadge}
              title="Add a new story"
              onClick={(e) => {
                e.stopPropagation();
                setShowCreator(true);
              }}
            >
              +
            </span>
          </div>
          <span className={styles.name}>Your story</span>
        </div>

        {/* Connections & Other User Stories */}
        {storyGroups.map((group, groupIdx) => {
          const author = group.user;
          const authorId = author?._id?.toString() || author?.id?.toString();

          // Skip rendering logged in user twice if shown first
          if (authorId === currentUserId && groupIdx === 0) return null;

          return (
            <div
              key={authorId}
              className={styles.item}
              onClick={() => setActiveViewerGroupIndex(groupIdx)}
            >
              <div
                className={`${styles.ring} ${
                  !group.hasUnseen ? styles.seen : ""
                }`}
              >
                {author?.profilePicture && author.profilePicture !== "default.jpg" ? (
                  <img src={author.profilePicture} alt="" className={styles.avatar} />
                ) : (
                  <div className={styles.fallbackAvatar}>{initials(author?.name)}</div>
                )}
              </div>
              <span className={styles.name}>{author?.name?.split(" ")[0] || author?.username}</span>
            </div>
          );
        })}
      </div>

      {/* Creator Modal */}
      {showCreator && (
        <StoryCreator
          onClose={() => setShowCreator(false)}
          onCreated={handleStoryCreated}
        />
      )}

      {/* Viewer Modal */}
      {activeViewerGroupIndex !== null && (
        <StoryViewer
          storyGroups={storyGroups}
          initialGroupIndex={activeViewerGroupIndex}
          onClose={() => {
            setActiveViewerGroupIndex(null);
            fetchActiveStories();
          }}
          onAddStory={() => setShowCreator(true)}
          currentUser={currentUser}
        />
      )}
    </>
  );
}

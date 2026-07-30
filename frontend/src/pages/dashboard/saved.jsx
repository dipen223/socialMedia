import { useState, useEffect } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import PostCard from "@/components/dashboard/PostCard";
import { clientServer } from "@/config";
import styles from "@/styles/savedPage.module.css";

const BookmarkIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

export default function SavedPostsPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSavedPosts = async () => {
      try {
        const res = await clientServer.get("/saved_posts");
        setPosts(res.data?.posts || []);
      } catch (err) {
        console.error("Failed to fetch saved posts:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSavedPosts();
  }, []);

  return (
    <DashboardLayout>
      <div className={styles.page}>
        <header className={styles.heroHeader}>
          <h1>
            <BookmarkIcon /> Saved Bookmarks
          </h1>
          <p>Posts and articles you saved for quick reference later.</p>
        </header>

        <div className={styles.feedList}>
          {loading && (
            <div className={styles.emptyState}>
              <span>Loading saved posts...</span>
            </div>
          )}

          {!loading && posts.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <BookmarkIcon />
              </div>
              <strong>No saved posts yet</strong>
              <p>Click the Save button on any post to keep track of interesting ideas here.</p>
            </div>
          )}

          {!loading &&
            posts.map((post) => (
              <PostCard key={post._id} post={post} />
            ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

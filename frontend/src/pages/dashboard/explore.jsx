import { useState, useEffect } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import PostCard from "@/components/dashboard/PostCard";
import SuggestedProfiles from "@/components/dashboard/SuggestedProfiles";
import { clientServer } from "@/config";
import styles from "@/styles/explorePage.module.css";

const TrendingIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5z" />
  </svg>
);

const UsersIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function ExplorePage() {
  const [trendingTags, setTrendingTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("trending");

  // Fetch trending hashtags on mount
  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const res = await clientServer.get("/trending_hashtags");
        if (res.data?.trending) {
          setTrendingTags(res.data.trending);
        }
      } catch (err) {
        console.error("Failed to fetch trending hashtags:", err);
      }
    };

    fetchTrending();
  }, []);

  // Fetch posts (either by selected hashtag or all posts)
  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      try {
        if (selectedTag) {
          const cleanTag = selectedTag.replace("#", "");
          const res = await clientServer.get(`/hashtag/${cleanTag}`);
          setPosts(res.data?.posts || []);
        } else {
          const res = await clientServer.get("/allPosts");
          setPosts(res.data?.posts || []);
        }
      } catch (err) {
        console.error("Failed to fetch explore posts:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [selectedTag]);

  return (
    <DashboardLayout>
      <div className={styles.page}>
        {/* Glassmorphic Hero Banner */}
        <header className={styles.heroHeader}>
          <h1>Explore & Discover</h1>
          <p>
            Uncover trending conversations, viral ideas, topics, and creators shaping the community.
          </p>
        </header>

        {/* Trending Hashtags Section */}
        <section className={styles.trendingSection}>
          <div className={styles.sectionTitle}>
            <TrendingIcon />
            <span>Trending Hashtags</span>
            {selectedTag && (
              <button
                className={styles.clearFilterBtn}
                onClick={() => setSelectedTag(null)}
              >
                Clear Filter <CloseIcon />
              </button>
            )}
          </div>

          <div className={styles.hashtagGrid}>
            {trendingTags.map(({ tag, count }) => {
              const isActive = selectedTag?.toLowerCase() === tag.toLowerCase();
              return (
                <button
                  key={tag}
                  className={`${styles.tagPill} ${isActive ? styles.tagPillActive : ""}`}
                  onClick={() =>
                    setSelectedTag(isActive ? null : tag)
                  }
                >
                  <span>{tag}</span>
                  <span className={styles.tagCount}>{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Filter Navigation Tabs */}
        <div className={styles.tabsBar}>
          <button
            className={`${styles.tabBtn} ${activeTab === "trending" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("trending")}
          >
            <TrendingIcon />
            <span>{selectedTag ? `Filtered by ${selectedTag}` : "Popular Posts"}</span>
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === "creators" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("creators")}
          >
            <UsersIcon />
            <span>Discover People</span>
          </button>
        </div>

        {/* Dynamic Content */}
        <div className={styles.contentGrid}>
          {activeTab === "trending" && (
            <>
              {loading && (
                <div className={styles.statusNotice}>
                  Loading trending posts...
                </div>
              )}

              {!loading && posts.length === 0 && (
                <div className={styles.statusNotice}>
                  No posts found {selectedTag ? `for ${selectedTag}` : ""}. Be the first to start a conversation!
                </div>
              )}

              {!loading &&
                posts.map((post) => (
                  <PostCard key={post._id} post={post} />
                ))}
            </>
          )}

          {activeTab === "creators" && <SuggestedProfiles />}
        </div>
      </div>
    </DashboardLayout>
  );
}

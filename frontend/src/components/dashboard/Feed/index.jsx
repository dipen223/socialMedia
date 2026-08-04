import CreatePost from "@/components/dashboard/CreatePost";
import PostCard from "@/components/dashboard/PostCard";
import StoriesBar from "@/components/dashboard/StoriesBar";
import styles from "./Feed.module.css";

const Feed = ({ posts }) => {
  return (
    <section className={styles.feed} aria-labelledby="feed-title">
      <h1 className={styles.srOnly} id="feed-title">Home feed</h1>
      <StoriesBar />
      <CreatePost />

      {posts.length === 0 ? (
        <div className={styles.empty}>
          <h2>No posts yet</h2>
          <p>New posts from your community will appear here.</p>
        </div>
      ) : (
        <div className={styles.postList}>
          {posts.map((post) => <PostCard post={post} key={post._id} />)}
        </div>
      )}
    </section>
  );
};

export default Feed;

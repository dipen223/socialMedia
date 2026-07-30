import CreatePost from "@/components/dashboard/CreatePost";
import PostCard from "@/components/dashboard/PostCard";
import StoriesBar from "@/components/dashboard/StoriesBar";
import styles from "./Feed.module.css";
import { useSelector } from "react-redux";

const Feed = ({ posts }) => {
  const profile = useSelector((state) =>state.auth.user);
  const currentUser = profile?.userId || profile;

  const filteredPosts = posts.filter(
    (post) => post.userId?._id?.toString() !== currentUser?._id?.toString()
  );

  return (
    <section className={styles.feed} aria-labelledby="feed-title">
      <h1 className={styles.srOnly} id="feed-title">Home feed</h1>
      <StoriesBar />
      <CreatePost />

      {filteredPosts.length === 0 ? (
        <div className={styles.empty}>
          <h2>No posts yet</h2>
          <p>New posts from your community will appear here.</p>
        </div>
      ) : (
        <div className={styles.postList}>
          {filteredPosts.map((post) => <PostCard post={post} key={post._id} />)}
        </div>
      )}
    </section>
  );
};

export default Feed;

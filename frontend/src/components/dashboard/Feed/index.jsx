import CreatePost from "@/components/dashboard/CreatePost";
import styles from "./Feed.module.css";

const Feed = ({ posts }) => {
  return (
    <section className={styles.feed} aria-labelledby="feed-title">
      <h1 className={styles.srOnly} id="feed-title">Home feed</h1>
      <CreatePost />

      {posts.length === 0 ? (
        <div className={styles.empty}>
          <h2>No posts yet</h2>
          <p>New posts from your community will appear here.</p>
        </div>
      ) : (
        <div className={styles.postList}>
          {posts.map((post) => (
            <article className={styles.post} key={post._id}>
              <header className={styles.author}>
                <span className={styles.avatar}>
                  {post.userId?.profilePicture && post.userId.profilePicture !== "default.jpg" ? (
                    <img src={post.userId.profilePicture} alt="" />
                  ) : (
                    post.userId?.name?.[0]?.toUpperCase() || "S"
                  )}
                </span>
                <div>
                  <strong>{post.userId?.name || "SocialHub member"}</strong>
                  <span>@{post.userId?.username || "member"}</span>
                </div>
              </header>

              <p className={styles.body}>{post.body}</p>
              {post.media && <img className={styles.media} src={post.media} alt="Post attachment" />}
              <footer className={styles.postFooter}><span>{post.likes || 0} likes</span></footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default Feed;

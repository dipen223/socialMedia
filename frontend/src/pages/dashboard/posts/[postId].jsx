import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import PostCard from "@/components/dashboard/PostCard";
import { getAllPosts } from "@/config/redux/action/postAction";
import styles from "@/styles/postDetail.module.css";

export default function PostDetailPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { posts, isLoading, postFetched } = useSelector((state) => state.posts);
  const post = posts.find((item) => item._id === router.query.postId);

  useEffect(() => {
    if (router.isReady && !post && !postFetched && !isLoading) dispatch(getAllPosts());
  }, [dispatch, isLoading, post, postFetched, router.isReady]);

  return (
    <DashboardLayout>
      <section className={styles.detail}>
        <Link className={styles.back} href="/dashboard">← Back to posts</Link>

        {post ? (
          <PostCard post={post} detail />
        ) : isLoading || !postFetched ? (
          <div className={styles.status}>Loading post...</div>
        ) : (
          <div className={styles.status}>
            <h1>Post not found</h1>
            <p>It may have been removed or is no longer available.</p>
          </div>
        )}
      </section>
    </DashboardLayout>
  );
}

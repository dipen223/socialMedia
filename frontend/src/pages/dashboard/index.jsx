import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import Feed from "@/components/dashboard/Feed";
import { getAllPosts } from "@/config/redux/action/postAction";

export default function Dashboard() {
  const dispatch = useDispatch();
  const posts = useSelector((state) => state.posts.posts);

  useEffect(() => {
    dispatch(getAllPosts());
  }, [dispatch]);

  return (
    <DashboardLayout>
      <Feed posts={posts} />
    </DashboardLayout>
  );
}

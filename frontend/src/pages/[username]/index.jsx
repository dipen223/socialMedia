import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ConnectButton from "@/components/dashboard/ConnectionButton";
import PostCard from "@/components/dashboard/PostCard";
import { getAllProfiles } from "@/config/redux/action/profileAction";
import { getAllPosts } from "@/config/redux/action/postAction";
import { selectRelationshipWithUser } from "@/config/redux/selector/connectionSelector";
import { clientServer } from "@/config";
import styles from "@/styles/profilePage.module.css";

export default function UsernameProfilePage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const username = typeof router.query.username === "string" ? router.query.username.toLowerCase() : "";
  const currentProfile = useSelector((state) => state.auth.user);
  const { profiles, isLoading: profilesLoading, isError: profilesError, message: profilesMessage, hasFetched } = useSelector((state) => state.profiles);
  const { posts, isLoading: postsLoading, isError: postsError, message: postsMessage, postFetched } = useSelector((state) => state.posts);
  const [isOpeningMessage, setIsOpeningMessage] = useState(false);
  const [messageError, setMessageError] = useState("");

  useEffect(() => {
    if (!hasFetched && !profilesLoading && !profilesError) dispatch(getAllProfiles());
    if (!postFetched && !postsLoading && !postsError) dispatch(getAllPosts());
  }, [dispatch, hasFetched, postFetched, postsError, postsLoading, profilesError, profilesLoading]);

  const profile = useMemo(
    () => profiles.find((item) => item.userId?.username?.toLowerCase() === username),
    [profiles, username]
  );

  const profilePosts = useMemo(
    () => posts.filter((post) => post.userId?._id?.toString() === profile?.userId?._id?.toString()),
    [posts, profile]
  );

  const signedInUser = currentProfile?.userId || currentProfile;
  const isOwnProfile = signedInUser?._id?.toString() === profile?.userId?._id?.toString();
  const user = profile?.userId;
  const relationship = useSelector((state) =>
    selectRelationshipWithUser(state, user?._id)
  );
  const hasPicture = user?.profilePicture && user.profilePicture !== "default.jpg";
  const initials = user?.name?.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "R";

  const openConversation = async () => {
    if (!user?._id || relationship.status !== "connected" || isOpeningMessage) {
      return;
    }

    setIsOpeningMessage(true);
    setMessageError("");
    try {
      const response = await clientServer.post("/conversations/direct", {
        recipientId: user._id,
      });
      await router.push(
        `/dashboard/messages?conversation=${response.data.conversation._id}`
      );
    } catch (error) {
      setMessageError(
        error.response?.data?.message ||
          "Could not open the conversation."
      );
      setIsOpeningMessage(false);
    }
  };

  return (
    <DashboardLayout>
      {(profilesLoading || postsLoading || !router.isReady) && <div className={styles.status}>Loading profile...</div>}

      {(profilesError || postsError) && (
        <div className={`${styles.status} ${styles.error}`} role="alert">
          {profilesMessage || postsMessage || "Could not load this profile."}
        </div>
      )}

      {!profilesLoading && !profilesError && hasFetched && !profile && (
        <div className={styles.status}>
          <h1>Profile not found</h1>
          <p>We couldn&apos;t find anyone with the username @{username}.</p>
        </div>
      )}

      {profile && (
        <div className={styles.page}>
          <section className={styles.profileCard}>
            <div className={styles.cover} />
            <div className={styles.profileBody}>
              <span className={styles.avatar}>
                {hasPicture ? <img src={user.profilePicture} alt="" /> : initials}
              </span>
              <div className={styles.identity}>
                <div>
                  <h1>{user.name}</h1>
                  <p>@{user.username}</p>
                </div>
                {isOwnProfile ? (
                  <button type="button">Edit profile</button>
                ) : (
                  <div className={styles.profileActions}>
                    <ConnectButton userId={user._id} />
                    {relationship.status === "connected" && (
                      <button
                        className={styles.messageButton}
                        type="button"
                        disabled={isOpeningMessage}
                        onClick={openConversation}
                      >
                        {isOpeningMessage ? "Opening…" : "Message"}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {messageError && (
                <p className={styles.actionError} role="alert">
                  {messageError}
                </p>
              )}
              <p className={styles.bio}>{profile.bio || "No bio added yet."}</p>
              {profile.currentPost && <p className={styles.currentPost}>{profile.currentPost}</p>}
              {profile.interests?.length > 0 && (
                <ul className={styles.interests} aria-label="Interests">
                  {profile.interests.map((interest) => <li key={interest}>{interest}</li>)}
                </ul>
              )}
            </div>
          </section>

          <section className={styles.postsSection}>
            <header><h2>{isOwnProfile ? "Your posts" : `${user.name}'s posts`}</h2><span>{profilePosts.length}</span></header>
            {profilePosts.length === 0 ? (
              <div className={styles.noPosts}>No posts to show yet.</div>
            ) : (
              <div className={styles.postList}>
                {profilePosts.map((post) => <PostCard post={post} key={post._id} />)}
              </div>
            )}
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}

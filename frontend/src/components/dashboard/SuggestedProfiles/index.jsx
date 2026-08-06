import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import { getAllProfiles } from "@/config/redux/action/profileAction";
import ConnectButton from "@/components/dashboard/ConnectionButton";
import styles from "./SuggestedProfiles.module.css";

export default function SuggestedProfiles() {
  const dispatch = useDispatch();
  const currentProfile = useSelector((state) => state.auth.user);
  const connectionError = useSelector((state) => state.connections.error);

  const { profiles, isLoading, isError, message, hasFetched } = useSelector(
    (state) => state.profiles
  );

  useEffect(() => {
    if (!hasFetched && !isLoading && !isError) {
      dispatch(getAllProfiles());
    }
  }, [dispatch, hasFetched, isError, isLoading]);

  const discoverProfiles = useMemo(() => {
    const currentUserId = currentProfile?.userId?._id || currentProfile?._id;

    return profiles.filter(
      (profile) => profile.userId?._id && profile.userId._id !== currentUserId
    );
  }, [currentProfile, profiles]);

  return (
    <section className={styles.discover} aria-labelledby="discover-title">

      {isLoading && <div className={styles.status} role="status">Loading people...</div>}

      {isError && (
        <div className={`${styles.status} ${styles.error}`} role="alert">
          <p>{message}</p>
          <button type="button" onClick={() => dispatch(getAllProfiles())}>Try again</button>
        </div>
      )}

      {connectionError && (
        <div
          className={`${styles.status} ${styles.error}`}
          role="alert"
        >
          <p>{connectionError}</p>
        </div>
      )}

      {!isLoading && !isError && discoverProfiles.length === 0 && (
        <div className={styles.status}>
          <h2>No new people right now</h2>
          <p>Check back later as the SocialHub community grows.</p>
        </div>
      )}

      {!isLoading && !isError && discoverProfiles.length > 0 && (
        <div className={styles.grid}>
          {discoverProfiles.map((profile) => {
            const user = profile.userId;
            const hasPicture = user.profilePicture && user.profilePicture !== "default.jpg";
            const initials = user.name?.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "R";

            return (
              <article className={styles.card} key={profile._id}>
                <Link className={styles.avatar} href={`/${user.username}`} aria-label={`View ${user.name}'s profile`}>
                  {hasPicture ? <img src={user.profilePicture} alt="" /> : initials}
                </Link>
                <div className={styles.identity}>
                  <Link href={`/${user.username}`}>
                    <h2>{user.name}</h2>
                    <p>@{user.username}</p>
                  </Link>
                </div>
                <p className={styles.bio}>{profile.bio || "New to SocialHub."}</p>

                {profile.interests?.length > 0 && (
                  <ul className={styles.interests} aria-label="Interests">
                    {profile.interests.slice(0, 3).map((interest) => <li key={interest}>{interest}</li>)}
                  </ul>
                )}
                <ConnectButton
                  userId={user._id}
                  className={styles.connectButton}
                />
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

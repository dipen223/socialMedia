import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import {
  acceptConnectionRequest,
  deleteConnectionRequest,
  getMyConnections,
  getReceivedRequests,
} from "@/config/redux/action/connectionAction";
import styles from "@/styles/connectionsPage.module.css";

const UserAvatar = ({ user }) => {
  const hasPicture =
    user?.profilePicture && user.profilePicture !== "default.jpg";
  const initials =
    user?.name
      ?.split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "R";

  return (
    <span className={styles.avatar}>
      {hasPicture ? (
        <img src={user.profilePicture} alt={user.name || "User"} />
      ) : (
        initials
      )}
    </span>
  );
};

export default function ConnectionsPage() {
  const dispatch = useDispatch();
  const router = useRouter();

  const {
    receivedRequests,
    connections,
    acceptingRequestId,
    deletingRequestId,
    isLoadingReceived,
    isLoadingConnections,
    error,
  } = useSelector((state) => state.connections);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.push("/login");
      return;
    }

    dispatch(getReceivedRequests());
    dispatch(getMyConnections());
  }, [dispatch, router]);

  const handleAccept = async (requestId) => {
    try {
      await dispatch(acceptConnectionRequest(requestId)).unwrap();
      await dispatch(getMyConnections());
    } catch (err) {
      console.error("Failed to accept connection request:", err);
    }
  };

  const handleDelete = async (requestId) => {
    try {
      await dispatch(deleteConnectionRequest(requestId)).unwrap();
    } catch (err) {
      console.error("Failed to delete connection request:", err);
    }
  };

  const retryLoading = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.push("/login");
      return;
    }
    dispatch(getReceivedRequests());
    dispatch(getMyConnections());
  };

  return (
    <DashboardLayout>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.heroCopy}>
            <h1>Connections</h1>
            <span>Manage requests and people you’ve connected with.</span>
          </div>

          <div className={styles.networkStats} aria-label="Network summary">
            <div className={styles.statCard}>
              <strong>{receivedRequests.length}</strong>
              <span>Pending</span>
            </div>
            <div className={styles.statCard}>
              <strong>{connections.length}</strong>
              <span>Connections</span>
            </div>
          </div>
        </header>

        {error && (
          <div className={`${styles.status} ${styles.error}`} role="alert">
            <p>{error}</p>
            <button type="button" onClick={retryLoading}>
              Try again
            </button>
          </div>
        )}

        <section className={styles.section} aria-labelledby="requests-title">
          <header className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <div>
                <h2 id="requests-title">Requests</h2>
                <p>People who want to connect with you.</p>
              </div>
            </div>
            {receivedRequests.length > 0 && (
              <span className={styles.countBadge}>{receivedRequests.length}</span>
            )}
          </header>

          {isLoadingReceived && receivedRequests.length === 0 && (
            <div className={styles.status} role="status">
              Loading requests...
            </div>
          )}

          {!isLoadingReceived && receivedRequests.length === 0 && (
            <div className={styles.empty}>
              <h3>No requests</h3>
              <p>New connection requests will appear here.</p>
            </div>
          )}

          {receivedRequests.length > 0 && (
            <ul className={styles.list}>
              {receivedRequests.map((request) => {
                const requester = request.requesterId;
                const isAccepting = acceptingRequestId === request._id;
                const isDeleting = deletingRequestId === request._id;
                const isUpdating = isAccepting || isDeleting;

                if (!requester) return null;

                return (
                  <li className={styles.requestCard} key={request._id}>
                    <Link className={styles.person} href={`/${requester.username}`}>
                      <UserAvatar user={requester} />
                      <span className={styles.identity}>
                        <strong>{requester.name}</strong>
                        <small>@{requester.username}</small>
                      </span>
                    </Link>

                    <div className={styles.requestActions}>
                      <button
                        className={styles.confirmButton}
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleAccept(request._id)}
                      >
                        {isAccepting ? "Accepting..." : "Accept"}
                      </button>
                      <button
                        className={styles.deleteButton}
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleDelete(request._id)}
                      >
                        {isDeleting ? "Declining..." : "Decline"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={styles.section} aria-labelledby="connections-title">
          <header className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <div>
                <h2 id="connections-title">Your connections</h2>
                <p>{connections.length} {connections.length === 1 ? "person" : "people"}</p>
              </div>
            </div>
            <Link href="/dashboard/discover" className={styles.discoverBtn}>
              Find people
            </Link>
          </header>

          {isLoadingConnections && connections.length === 0 && (
            <div className={styles.status} role="status">
              Loading your connections...
            </div>
          )}

          {!isLoadingConnections && connections.length === 0 && (
            <div className={styles.empty}>
              <h3>No connections yet</h3>
              <p>Find people you know or want to follow.</p>
              <Link href="/dashboard/discover" className={styles.ctaBtn}>
                Find people
              </Link>
            </div>
          )}

          {connections.length > 0 && (
            <ul className={styles.connectionGrid}>
              {connections.map((connection) => {
                const person = connection.user;
                if (!person) return null;

                return (
                  <li key={connection.connectionId || person._id}>
                    <Link href={`/${person.username}`} className={styles.connectionCard}>
                      <UserAvatar user={person} />
                      <span className={styles.identity}>
                        <strong>{person.name}</strong>
                        <small>@{person.username}</small>
                      </span>
                      <span className={styles.viewProfile}>
                        View profile
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

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
            <p className={styles.eyebrow}>Network Hub</p>
            <h1>My Network</h1>
            <span>
              Manage connection requests, expand your network, and engage with professionals.
            </span>
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
              Retry Connection
            </button>
          </div>
        )}

        {/* Pending Connection Requests */}
        <section className={styles.section} aria-labelledby="requests-title">
          <header className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon} aria-hidden="true">
                👥
              </span>
              <div>
                <h2 id="requests-title">Pending Invitations</h2>
                <p>People requesting to connect with you.</p>
              </div>
            </div>
            {receivedRequests.length > 0 && (
              <span className={styles.countBadge}>{receivedRequests.length}</span>
            )}
          </header>

          {isLoadingReceived && receivedRequests.length === 0 && (
            <div className={styles.status} role="status">
              Loading invitations...
            </div>
          )}

          {!isLoadingReceived && receivedRequests.length === 0 && (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>📬</div>
              <h3>No pending invitations</h3>
              <p>When someone invites you to connect, their request will show up here.</p>
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
                        <em>Wants to join your professional network</em>
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
                        {isDeleting ? "Declining..." : "Ignore"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Your Network Connections */}
        <section className={styles.section} aria-labelledby="connections-title">
          <header className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon} aria-hidden="true">
                🌐
              </span>
              <div>
                <h2 id="connections-title">Your Connections</h2>
                <p>People currently in your network ({connections.length}).</p>
              </div>
            </div>
            <Link href="/dashboard/discover" className={styles.discoverBtn}>
              Find People +
            </Link>
          </header>

          {isLoadingConnections && connections.length === 0 && (
            <div className={styles.status} role="status">
              Loading your connections...
            </div>
          )}

          {!isLoadingConnections && connections.length === 0 && (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>🚀</div>
              <h3>Expand Your Network</h3>
              <p>Connect with colleagues, creators, and professionals to build your community.</p>
              <Link href="/dashboard/discover" className={styles.ctaBtn}>
                Explore People & Connections →
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
                        View Profile →
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

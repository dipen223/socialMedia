import Link from "next/link";
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
    user?.profilePicture &&
    user.profilePicture !== "default.jpg";
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
        <img src={user.profilePicture} alt="" />
      ) : (
        initials
      )}
    </span>
  );
};

export default function ConnectionsPage() {
  const dispatch = useDispatch();
  const {
    receivedRequests,
    connections,
    acceptingRequestId,
    deletingRequestId,
    isLoadingReceived,
    isLoadingConnections,
    error,
  } = useSelector((state) => state.connections);

  const handleAccept = async (requestId) => {
    try {
      await dispatch(
        acceptConnectionRequest(requestId)
      ).unwrap();
      await dispatch(getMyConnections());
    } catch {
      // Redux stores and displays the user-facing error.
    }
  };

  const handleDelete = async (requestId) => {
    try {
      await dispatch(
        deleteConnectionRequest(requestId)
      ).unwrap();
    } catch {
      // Redux stores and displays the user-facing error.
    }
  };

  const retryLoading = () => {
    dispatch(getReceivedRequests());
    dispatch(getMyConnections());
  };

  return (
    <DashboardLayout>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>My network</p>
            <h1>Connections</h1>
            <span>
              Review requests and keep up with people in your network.
            </span>
          </div>
          <div className={styles.networkStats} aria-label="Network summary">
            <div>
              <strong>{receivedRequests.length}</strong>
              <span>Pending</span>
            </div>
            <div>
              <strong>{connections.length}</strong>
              <span>Connected</span>
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
              <span className={styles.sectionIcon} aria-hidden="true">
                +
              </span>
              <div>
                <h2 id="requests-title">Connection requests</h2>
                <p>People who would like to connect with you.</p>
              </div>
            </div>
            {receivedRequests.length > 0 && (
              <span className={styles.countBadge}>{receivedRequests.length}</span>
            )}
          </header>

          {isLoadingReceived && receivedRequests.length === 0 && (
            <div className={styles.status} role="status">
              Loading connection requests...
            </div>
          )}

          {!isLoadingReceived && receivedRequests.length === 0 && (
            <div className={styles.empty}>
              <h3>No pending requests</h3>
              <p>New connection requests will appear here.</p>
            </div>
          )}

          {receivedRequests.length > 0 && (
            <ul className={styles.list}>
              {receivedRequests.map((request) => {
                const requester = request.requesterId;
                const isAccepting =
                  acceptingRequestId === request._id;
                const isDeleting =
                  deletingRequestId === request._id;
                const isUpdating = isAccepting || isDeleting;

                if (!requester) return null;

                return (
                  <li className={styles.requestCard} key={request._id}>
                    <Link
                      className={styles.person}
                      href={`/${requester.username}`}
                    >
                      <UserAvatar user={requester} />
                      <span className={styles.identity}>
                        <strong>{requester.name}</strong>
                        <small>@{requester.username}</small>
                        <em>Wants to join your network</em>
                      </span>
                    </Link>

                    <div className={styles.requestActions}>
                      <button
                        className={styles.confirmButton}
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleAccept(request._id)}
                      >
                        {isAccepting ? "Confirming..." : "Confirm"}
                      </button>
                      <button
                        className={styles.deleteButton}
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleDelete(request._id)}
                      >
                        {isDeleting ? "Deleting..." : "Delete"}
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
              <span className={styles.sectionIcon} aria-hidden="true">
                ✓
              </span>
              <div>
                <h2 id="connections-title">Your connections</h2>
                <p>People currently in your network.</p>
              </div>
            </div>
          </header>

          {isLoadingConnections && connections.length === 0 && (
            <div className={styles.status} role="status">
              Loading connections...
            </div>
          )}

          {!isLoadingConnections && connections.length === 0 && (
            <div className={styles.empty}>
              <h3>Your network is ready to grow</h3>
              <p>Accepted connections will appear here.</p>
              <Link href="/dashboard/discover">Discover people</Link>
            </div>
          )}

          {connections.length > 0 && (
            <ul className={styles.connectionGrid}>
              {connections.map((connection) => {
                const person = connection.user;
                if (!person) return null;

                return (
                  <li key={connection.connectionId}>
                    <Link href={`/${person.username}`}>
                      <UserAvatar user={person} />
                      <span className={styles.identity}>
                        <strong>{person.name}</strong>
                        <small>@{person.username}</small>
                      </span>
                      <span className={styles.viewProfile}>
                        View <span aria-hidden="true">→</span>
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

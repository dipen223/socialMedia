import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { sendConnectionRequest } from "@/config/redux/action/connectionAction";
import { selectRelationshipWithUser } from "@/config/redux/selector/connectionSelector";
import styles from "./ConnectionButton.module.css";

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="6" y1="12" x2="18" y2="12" />
  </svg>
);

export default function ConnectButton({ userId, className }) {
  const dispatch = useDispatch();
  const router = useRouter();

  const relationship = useSelector((state) =>
    selectRelationshipWithUser(state, userId)
  );

  const isLoadingRelationships = useSelector((state) => {
    const { hasFetchedSent, hasFetchedReceived, hasFetchedConnections } = state.connections;
    return !hasFetchedSent || !hasFetchedReceived || !hasFetchedConnections;
  });

  if (!userId) {
    return null;
  }

  const handleClick = async () => {
    if (relationship.status === "incoming") {
      router.push("/dashboard/connections");
      return;
    }

    if (relationship.status !== "none") {
      return;
    }

    try {
      await dispatch(sendConnectionRequest(userId)).unwrap();
    } catch {
      // Error handled by Redux state
    }
  };

  if (relationship.status === "connected") {
    return null;
  }

  if (relationship.status === "outgoing") {
    return (
      <span className={`${styles.pendingBadge} ${className || ""}`}>
        Request sent
      </span>
    );
  }

  if (relationship.status === "incoming") {
    return (
      <button
        type="button"
        className={`${styles.respondBtn} ${className || ""}`}
        onClick={handleClick}
      >
        Respond
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.connectBtn} ${className || ""}`}
      disabled={relationship.status === "sending" || isLoadingRelationships}
      onClick={handleClick}
    >
      <PlusIcon /> {relationship.status === "sending" ? "Sending..." : isLoadingRelationships ? "Loading..." : "Connect"}
    </button>
  );
}

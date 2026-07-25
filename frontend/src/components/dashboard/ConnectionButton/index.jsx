import { useRouter } from "next/router";

import { useDispatch, useSelector } from "react-redux";

import { sendConnectionRequest } from "@/config/redux/action/connectionAction";
import { selectRelationshipWithUser } from "@/config/redux/selector/connectionSelector";


export default function ConnectButton({
  userId,
  className,
}) {
  const dispatch = useDispatch();
  const router = useRouter();

  const relationship = useSelector((state) =>
    selectRelationshipWithUser(
      state,
      userId
    )
  );
  const isLoadingRelationships = useSelector((state) => {
    const {
      hasFetchedSent,
      hasFetchedReceived,
      hasFetchedConnections,
    } = state.connections;

    return !hasFetchedSent ||
      !hasFetchedReceived ||
      !hasFetchedConnections;
  });

  const handleClick = async () => {
    if (relationship.status === "incoming") {
      router.push("/dashboard/connections");
      return;
    }

    if (relationship.status !== "none") {
      return;
    }

    try {
      await dispatch(
        sendConnectionRequest(userId)
      ).unwrap();
    } catch {
      // Redux stores the error.
    }
  };

  const labels = {
    none: "Connect",
    sending: "Sending...",
    outgoing: "Request sent",
    incoming: "Respond",
    connected: "Connected",
  };

  if (!userId) {
    return null;
  }

  const label = isLoadingRelationships
    ? "Loading..."
    : labels[relationship.status];

  return (
    <button
      type="button"
      className={className}
      disabled={[
        "sending",
        "outgoing",
        "connected",
      ].includes(relationship.status) || isLoadingRelationships}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}

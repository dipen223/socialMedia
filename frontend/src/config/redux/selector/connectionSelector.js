const idsMatch = (firstId, secondId) =>
  firstId?.toString() === secondId?.toString();

export const selectRelationshipWithUser = (state, userId) => {
  const {
    sentRequests,
    receivedRequests,
    connections,
    sendingForUserId,
  } = state.connections;

  const isConnected = connections.some((connection) =>
    idsMatch(connection.user?._id, userId)
  );

  if (isConnected) {
    return {
      status: "connected",
      requestId: null,
    };
  }

  const receivedRequest = receivedRequests.find((request) => {
    const requesterId =
      request.requesterId?._id ||
      request.requesterId;

    return idsMatch(requesterId, userId);
  });

  if (receivedRequest) {
    return {
      status: "incoming",
      requestId: receivedRequest._id,
    };
  }

  const sentRequest = sentRequests.find((request) => {
    const recipientId =
      request.recipientId?._id ||
      request.recipientId;

    return idsMatch(recipientId, userId);
  });

  if (sentRequest) {
    return {
      status: "outgoing",
      requestId: sentRequest._id,
    };
  }

  if (idsMatch(sendingForUserId, userId)) {
    return {
      status: "sending",
      requestId: null,
    };
  }

  return {
    status: "none",
    requestId: null,
  };
};

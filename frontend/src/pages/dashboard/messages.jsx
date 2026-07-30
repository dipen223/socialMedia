import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { clientServer } from "@/config";
import {
  getConversations,
  getMessages,
} from "@/config/redux/action/chatAction";
import { getNotifications } from "@/config/redux/action/notificationAction";
import { getSocket } from "@/config/socket";
import styles from "@/styles/messages.module.css";

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22 16.9v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0 1 22 16.9Z" />
  </svg>
);

const VideoIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15 10 21 7v10l-6-3v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3Z" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m22 2-7 20-4-9-9-4 20-7Z" />
    <path d="M22 2 11 13" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m21 21-4.35-4.35m2.35-5.4A7.75 7.75 0 1 1 3.5 11.25a7.75 7.75 0 0 1 15.5 0Z" />
  </svg>
);

const getInitials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "R";

const getConversationPartner = (conversation, currentUserId) => {
  if (!conversation) return null;

  if (conversation.type === "group") {
    return {
      name: conversation.name || "Group conversation",
      username: "group",
      profilePicture: null,
    };
  }

  return conversation.members?.find(
    (member) => member?._id !== currentUserId
  );
};

const formatConversationTime = (date) => {
  if (!date) return "";

  const value = new Date(date);
  const today = new Date();

  if (value.toDateString() === today.toDateString()) {
    return value.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return value.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
};

const formatMessageTime = (date) =>
  date
    ? new Date(date).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

const formatCallDuration = (seconds = 0) => {
  const wholeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

const getCallLabel = (message, sentByMe) => {
  const mode = message.call?.mode === "video" ? "Video" : "Audio";
  const status = message.call?.status;
  if (status === "completed") {
    return `${mode} call · ${formatCallDuration(
      message.call?.durationSeconds
    )}`;
  }
  if (status === "missed") {
    return sentByMe ? `${mode} call · No answer` : `Missed ${mode.toLowerCase()} call`;
  }
  if (status === "declined") {
    return sentByMe ? `${mode} call declined` : `Declined ${mode.toLowerCase()} call`;
  }
  return `${mode} call cancelled`;
};

const Avatar = ({ person, className = "" }) => {
  const hasPicture =
    person?.profilePicture && person.profilePicture !== "default.jpg";

  return (
    <span className={`${styles.avatar} ${className}`}>
      {hasPicture ? (
        <img src={person.profilePicture} alt="" />
      ) : (
        getInitials(person?.name)
      )}
    </span>
  );
};

export default function MessagesPage() {
  const dispatch = useDispatch();
  const router = useRouter();
  const messageEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [presenceByUser, setPresenceByUser] = useState({});

  const profile = useSelector((state) => state.auth.user);
  const currentUser = profile?.userId || profile;
  const currentUserId = currentUser?._id;

  const {
    conversations,
    messagesByConversation,
    paginationByConversation,
    isLoadingConversations,
    isLoadingMessagesByConversation,
    error,
  } = useSelector((state) => state.chat);

  const activeConversation = conversations.find(
    (conversation) => conversation._id === activeConversationId
  );
  const activePartner = getConversationPartner(
    activeConversation,
    currentUserId
  );
  const activeMessages = useMemo(
    () =>
      activeConversationId
        ? messagesByConversation[activeConversationId] || []
        : [],
    [activeConversationId, messagesByConversation]
  );
  const activePagination = activeConversationId
    ? paginationByConversation[activeConversationId]
    : null;
  const isLoadingActiveMessages = activeConversationId
    ? Boolean(isLoadingMessagesByConversation[activeConversationId])
    : false;
  const newestMessageId = activeMessages.at(-1)?._id;
  const partnerIds = useMemo(
    () =>
      conversations
        .map(
          (conversation) =>
            getConversationPartner(conversation, currentUserId)?._id
        )
        .filter(Boolean),
    [conversations, currentUserId]
  );

  const visibleConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return conversations;

    return conversations.filter((conversation) => {
      const partner = getConversationPartner(conversation, currentUserId);
      return [partner?.name, partner?.username, conversation.lastMessageId?.body]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [conversations, currentUserId, searchQuery]);

  useEffect(() => {
    dispatch(getConversations());
  }, [dispatch]);

  useEffect(() => {
    const requestedConversationId = router.query.conversation;
    if (
      typeof requestedConversationId === "string" &&
      conversations.some(
        (conversation) => conversation._id === requestedConversationId
      )
    ) {
      const timeoutId = window.setTimeout(
        () => setActiveConversationId(requestedConversationId),
        0
      );
      return () => window.clearTimeout(timeoutId);
    }
    return undefined;
  }, [conversations, router.query.conversation]);

  useEffect(() => {
    if (!partnerIds.length) return undefined;
    const socket = getSocket();
    if (!socket) return undefined;

    const handlePresence = ({ userId, isOnline }) => {
      setPresenceByUser((current) => ({
        ...current,
        [userId]: isOnline,
      }));
    };
    const subscribe = () => {
      socket.emit(
        "presence:subscribe",
        { userIds: partnerIds },
        (response) => {
          if (response?.ok) {
            setPresenceByUser((current) => ({
              ...current,
              ...response.statuses,
            }));
          }
        }
      );
    };

    socket.on("presence:update", handlePresence);
    socket.on("connect", subscribe);
    if (socket.connected) subscribe();

    return () => {
      socket.off("presence:update", handlePresence);
      socket.off("connect", subscribe);
    };
  }, [partnerIds]);

  useEffect(() => {
    if (!activeConversationId) return;

    dispatch(getMessages({ conversationId: activeConversationId }));
  }, [activeConversationId, dispatch]);

  useEffect(() => {
    if (!activeConversationId || !newestMessageId) return;

    const newestMessage = activeMessages.at(-1);
    const senderId =
      newestMessage?.senderId?._id || newestMessage?.senderId;

    if (!senderId || senderId === currentUserId) return;

    const socket = getSocket();
    if (socket?.connected) {
      socket.emit(
        "message:read",
        { conversationId: activeConversationId },
        (response) => {
          if (response?.ok) dispatch(getNotifications());
        }
      );
      return;
    }

    clientServer.patch(`/conversations/${activeConversationId}/read`).catch(
      () => {
        // Reading messages remains possible while receipt sync retries later.
      }
    );
  }, [
    activeConversationId,
    activeMessages,
    currentUserId,
    dispatch,
    newestMessageId,
  ]);

  useEffect(() => {
    if (!newestMessageId) return;
    messageEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [activeConversationId, newestMessageId]);

  const selectConversation = (conversationId) => {
    setActiveConversationId(conversationId);
    setSendError("");
  };

  const startCall = (mode) => {
    if (
      !activeConversationId ||
      !activePartner?._id ||
      activeConversation?.type !== "direct"
    ) {
      return;
    }
    window.dispatchEvent(
      new CustomEvent("ripple:start-call", {
        detail: {
          conversationId: activeConversationId,
          mode,
          peer: activePartner,
        },
      })
    );
  };

  const handleAttachment = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isUploading) return;

    setIsUploading(true);
    setUploadProgress(0);
    setSendError("");
    try {
      const { data: signedUpload } = await clientServer.post(
        "/messages/upload-signature",
        { fileSize: file.size, fileType: file.type }
      );
      const uploadData = new FormData();
      uploadData.append("file", file);
      uploadData.append("api_key", signedUpload.apiKey);
      uploadData.append("timestamp", signedUpload.timestamp);
      uploadData.append("signature", signedUpload.signature);
      uploadData.append("public_id", signedUpload.publicId);
      uploadData.append("overwrite", String(signedUpload.overwrite));

      const response = await axios.post(
        `https://api.cloudinary.com/v1_1/${signedUpload.cloudName}/${signedUpload.resourceType}/upload`,
        uploadData,
        {
          onUploadProgress: ({ loaded, total }) => {
            if (total) setUploadProgress(Math.round((loaded * 100) / total));
          },
        }
      );
      setPendingAttachment({
        publicId: response.data.public_id,
        resourceType: response.data.resource_type,
        fileName: file.name,
        fileType: file.type,
      });
    } catch (uploadError) {
      setSendError(
        uploadError.response?.data?.message ||
          uploadError.response?.data?.error?.message ||
          "Could not upload this attachment."
      );
    } finally {
      setIsUploading(false);
    }
  };

  const loadOlderMessages = () => {
    if (
      !activeConversationId ||
      !activePagination?.hasMore ||
      !activePagination.nextCursor ||
      isLoadingActiveMessages
    ) {
      return;
    }

    dispatch(
      getMessages({
        conversationId: activeConversationId,
        before: activePagination.nextCursor,
      })
    );
  };

  const sendMessage = (event) => {
    event.preventDefault();

    const body = draft.trim();
    const socket = getSocket();

    if (
      (!body && !pendingAttachment) ||
      !activeConversationId ||
      isSending ||
      isUploading
    ) return;
    if (!socket?.connected) {
      setSendError("Reconnecting… Please try again in a moment.");
      return;
    }

    setIsSending(true);
    setSendError("");

    socket.timeout(8000).emit(
      "message:send",
      {
        conversationId: activeConversationId,
        body,
        attachment: pendingAttachment,
      },
      (timeoutError, response) => {
        setIsSending(false);

        if (timeoutError) {
          setSendError("The message timed out. Please try again.");
          return;
        }

        if (!response?.ok) {
          setSendError(response?.message || "Could not send the message.");
          return;
        }

        setDraft("");
        setPendingAttachment(null);
      }
    );
  };

  const saveEdit = (messageId) => {
    const body = editDraft.trim();
    const socket = getSocket();
    if (!body || !socket?.connected) return;
    socket.timeout(8000).emit(
      "message:edit",
      { messageId, body },
      (timeoutError, response) => {
        if (timeoutError || !response?.ok) {
          setSendError(
            response?.message || "Could not edit the message."
          );
          return;
        }
        setEditingMessageId(null);
        setEditDraft("");
      }
    );
  };

  const removeMessage = (messageId) => {
    if (!window.confirm("Delete this message for everyone?")) return;
    const socket = getSocket();
    if (!socket?.connected) {
      setSendError("Reconnecting… Please try again in a moment.");
      return;
    }
    socket.timeout(8000).emit(
      "message:delete",
      { messageId },
      (timeoutError, response) => {
        if (timeoutError || !response?.ok) {
          setSendError(
            response?.message || "Could not delete the message."
          );
        }
      }
    );
  };

  return (
    <DashboardLayout wide>
      <section
        className={`${styles.messenger} ${
          activeConversation ? styles.hasActiveConversation : ""
        }`}
      >
        <aside className={styles.conversationRail}>
          <header className={styles.railHeader}>
            <div>
              <h1>Messages</h1>
            </div>
            <button
              className={styles.newConversation}
              type="button"
              aria-label="Find someone to message"
              onClick={() => router.push("/dashboard/discover")}
            >
              +
            </button>
          </header>

          <label className={styles.conversationSearch}>
            <SearchIcon />
            <span className={styles.srOnly}>Search conversations</span>
            <input
              type="search"
              value={searchQuery}
              placeholder="Search conversations"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>

          <div className={styles.conversationList}>
            {isLoadingConversations && conversations.length === 0 && (
              <p className={styles.status}>Loading conversations…</p>
            )}

            {!isLoadingConversations && visibleConversations.length === 0 && (
              <div className={styles.railEmpty}>
                <strong>
                  {searchQuery ? "No matches" : "No conversations yet"}
                </strong>
                <span>
                  {searchQuery
                    ? "Try another name or message."
                    : "Find someone in Discover and start a conversation."}
                </span>
              </div>
            )}

            {visibleConversations.map((conversation) => {
              const partner =
                getConversationPartner(conversation, currentUserId) || {
                  name: "Ripple member",
                  username: "member",
                  profilePicture: null,
                };
              const lastMessage = conversation.lastMessageId;
              const senderId =
                lastMessage?.senderId?._id || lastMessage?.senderId;
              const preview = lastMessage
                ? `${senderId === currentUserId ? "You: " : ""}${
                    lastMessage.deletedAt
                      ? "Message deleted"
                      : lastMessage.type === "call"
                        ? getCallLabel(
                            lastMessage,
                            senderId === currentUserId
                          )
                        : lastMessage.body || "Shared an attachment"
                  }`
                : "Start the conversation";
              const isPartnerOnline = Boolean(
                partner?._id && presenceByUser[partner._id]
              );

              return (
                <button
                  className={`${styles.conversationButton} ${
                    conversation._id === activeConversationId
                      ? styles.active
                      : ""
                  }`}
                  key={conversation._id}
                  type="button"
                  onClick={() => selectConversation(conversation._id)}
                >
                  <span className={styles.avatarWrap}>
                    <Avatar person={partner} />
                    <span
                      className={`${styles.presenceDot} ${
                        isPartnerOnline
                          ? styles.online
                          : styles.offline
                      }`}
                      aria-hidden="true"
                    />
                  </span>
                  <span className={styles.conversationCopy}>
                    <span className={styles.conversationTopline}>
                      <strong>{partner.name}</strong>
                      <time>
                        {formatConversationTime(
                          lastMessage?.createdAt || conversation.updatedAt
                        )}
                      </time>
                    </span>
                    <span className={styles.preview}>{preview}</span>
                  </span>
                </button>
              );
            })}

            {error && (
              <p
                className={`${styles.status} ${styles.error}`}
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
        </aside>

        {activeConversation ? (
          <section className={styles.chatPanel}>
            <header className={styles.chatHeader}>
              <button
                className={styles.mobileBack}
                type="button"
                aria-label="Back to conversations"
                onClick={() => setActiveConversationId(null)}
              >
                ←
              </button>
              <Avatar person={activePartner} className={styles.headerAvatar} />
              <div className={styles.chatIdentity}>
                <strong>{activePartner?.name || "Ripple member"}</strong>
                <span>
                  <i
                    className={`${styles.inlinePresence} ${
                      presenceByUser[activePartner?._id]
                        ? styles.online
                        : styles.offline
                    }`}
                  />
                  {presenceByUser[activePartner?._id] ? "Online" : "Offline"}
                </span>
              </div>
              <div className={styles.callActions}>
                <button
                  type="button"
                  aria-label="Start audio call"
                  onClick={() => startCall("audio")}
                >
                  <PhoneIcon />
                </button>
                <button
                  type="button"
                  aria-label="Start video call"
                  onClick={() => startCall("video")}
                >
                  <VideoIcon />
                </button>
              </div>
            </header>

            <div className={styles.messageHistory}>
              {activePagination?.hasMore && (
                <button
                  className={styles.loadOlder}
                  type="button"
                  disabled={isLoadingActiveMessages}
                  onClick={loadOlderMessages}
                >
                  {isLoadingActiveMessages
                    ? "Loading older messages…"
                    : "Load earlier messages"}
                </button>
              )}

              {isLoadingActiveMessages && activeMessages.length === 0 && (
                <p className={styles.status}>Loading messages…</p>
              )}

              {!isLoadingActiveMessages && activeMessages.length === 0 && (
                <div className={styles.conversationBeginning}>
                  <Avatar
                    person={activePartner}
                    className={styles.beginningAvatar}
                  />
                  <strong>
                    Start a ripple with {activePartner?.name || "this member"}
                  </strong>
                  <span>
                    This is the beginning of your private conversation.
                  </span>
                </div>
              )}

              <div className={styles.messageStack}>
                {activeMessages.map((message) => {
                  const senderId =
                    message.senderId?._id || message.senderId;
                  const sentByMe = senderId === currentUserId;
                  const readBySomeoneElse =
                    sentByMe &&
                    message.readBy?.some(
                      (receipt) => receipt.userId !== currentUserId
                    );
                  const deliveredToSomeoneElse =
                    sentByMe &&
                    message.deliveredTo?.some(
                      (receipt) => receipt.userId !== currentUserId
                    );

                  return (
                    <article
                      className={`${styles.messageRow} ${
                        sentByMe ? styles.mine : styles.theirs
                      }`}
                      key={message._id}
                    >
                      {!sentByMe && (
                        <Avatar
                          person={message.senderId}
                          className={styles.messageAvatar}
                        />
                      )}
                      <div className={styles.messageBody}>
                        {sentByMe &&
                          !message.deletedAt &&
                          message.type !== "call" && (
                          <div className={styles.messageActions}>
                            {message.body && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMessageId(message._id);
                                  setEditDraft(message.body);
                                }}
                              >
                                Edit
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeMessage(message._id)}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                        {editingMessageId === message._id ? (
                          <div className={styles.editBox}>
                            <textarea
                              value={editDraft}
                              maxLength={5000}
                              aria-label="Edit message"
                              onChange={(event) =>
                                setEditDraft(event.target.value)
                              }
                            />
                            <span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMessageId(null);
                                  setEditDraft("");
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => saveEdit(message._id)}
                              >
                                Save
                              </button>
                            </span>
                          </div>
                        ) : message.deletedAt ? (
                          <p className={styles.deletedMessage}>
                            Message deleted
                          </p>
                        ) : message.type === "call" ? (
                          <div
                            className={`${styles.callRecord} ${
                              message.call?.summary
                                ? styles.callRecordWithSummary
                                : styles.compactCallRecord
                            }`}
                          >
                            <div
                              className={`${styles.callMessage} ${
                                message.call?.status === "missed" && !sentByMe
                                  ? styles.missedCall
                                  : ""
                              } ${
                                message.call?.mode === "audio"
                                  ? styles.audioCallMessage
                                  : ""
                              }`}
                            >
                              <span className={styles.callMessageIcon}>
                                {message.call?.mode === "video" ? (
                                  <VideoIcon />
                                ) : (
                                  <PhoneIcon />
                                )}
                              </span>
                              <span className={styles.callMessageCopy}>
                                <strong>
                                  {getCallLabel(message, sentByMe)}
                                </strong>
                                <small>
                                  {sentByMe ? "Outgoing" : "Incoming"}
                                </small>
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  startCall(message.call?.mode || "audio")
                                }
                              >
                                Call again
                              </button>
                            </div>
                            {message.call?.summary && (
                              <section className={styles.callSummary}>
                                <header>
                                  <span className={styles.summaryTitle}>
                                    <i aria-hidden="true">✦</i>
                                    <span>
                                      <strong>Call intelligence</strong>
                                      <small>Captured with mutual consent</small>
                                    </span>
                                  </span>
                                  <span
                                    className={`${styles.summaryStatus} ${
                                      message.call.summary.status === "ready"
                                        ? styles.summaryReady
                                        : message.call.summary.status ===
                                            "failed"
                                          ? styles.summaryFailed
                                          : styles.summaryProcessing
                                    }`}
                                  >
                                    {message.call.summary.status === "ready"
                                      ? "Ready"
                                      : message.call.summary.status === "failed"
                                        ? "Unavailable"
                                        : "Thinking"}
                                  </span>
                                </header>
                                {["pending", "processing"].includes(
                                  message.call.summary.status
                                ) && (
                                  <p>
                                    Transcribing the conversation and preparing
                                    key points…
                                    <span
                                      className={styles.summaryLoader}
                                      aria-hidden="true"
                                    >
                                      <i />
                                      <i />
                                      <i />
                                    </span>
                                  </p>
                                )}
                                {message.call.summary.status === "failed" && (
                                  <p>
                                    {message.call.summary.error ||
                                      "Ripple could not summarize this call."}
                                  </p>
                                )}
                                {message.call.summary.status === "ready" && (
                                  <>
                                    <div className={styles.summaryOverview}>
                                      <span>Overview</span>
                                      <p>{message.call.summary.overview}</p>
                                    </div>
                                    {message.call.summary.keyPoints?.length >
                                      0 && (
                                      <div className={styles.summarySection}>
                                        <b>
                                          <i aria-hidden="true">◇</i>
                                          Key insights
                                        </b>
                                        <ul>
                                          {message.call.summary.keyPoints.map(
                                            (point) => (
                                              <li key={point}>{point}</li>
                                            )
                                          )}
                                        </ul>
                                      </div>
                                    )}
                                    {message.call.summary.actionItems?.length >
                                      0 && (
                                      <div
                                        className={`${styles.summarySection} ${styles.actionSection}`}
                                      >
                                        <b>
                                          <i aria-hidden="true">✓</i>
                                          Next actions
                                        </b>
                                        <ul>
                                          {message.call.summary.actionItems.map(
                                            (item) => (
                                              <li key={item}>{item}</li>
                                            )
                                          )}
                                        </ul>
                                      </div>
                                    )}
                                  </>
                                )}
                              </section>
                            )}
                          </div>
                        ) : (
                          <>
                            {message.attachments?.map((attachment) => (
                              <div
                                className={styles.messageAttachment}
                                key={attachment.publicId}
                              >
                                {attachment.fileType?.startsWith("image/") && (
                                  <img
                                    src={attachment.url}
                                    alt={attachment.fileName}
                                  />
                                )}
                                {attachment.fileType?.startsWith("video/") && (
                                  <video controls preload="metadata">
                                    <source
                                      src={attachment.url}
                                      type={attachment.fileType}
                                    />
                                  </video>
                                )}
                                {attachment.fileType?.startsWith("audio/") && (
                                  <audio controls preload="metadata">
                                    <source
                                      src={attachment.url}
                                      type={attachment.fileType}
                                    />
                                  </audio>
                                )}
                                {!/^(image|video|audio)\//.test(
                                  attachment.fileType || ""
                                ) && (
                                  <a
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <b>↗</b>
                                    <span>{attachment.fileName}</span>
                                  </a>
                                )}
                              </div>
                            ))}
                            {message.body && <p>{message.body}</p>}
                          </>
                        )}
                        <span>
                          {formatMessageTime(message.createdAt)}
                          {message.editedAt && !message.deletedAt
                            ? " · Edited"
                            : ""}
                          {sentByMe
                            ? readBySomeoneElse
                              ? " · Read"
                              : deliveredToSomeoneElse
                                ? " · Delivered"
                                : " · Sent"
                            : ""}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div ref={messageEndRef} />
            </div>

            <footer className={styles.composerArea}>
              {sendError && (
                <p className={styles.composerError} role="alert">
                  {sendError}
                </p>
              )}
              <form className={styles.composer} onSubmit={sendMessage}>
                <input
                  ref={fileInputRef}
                  className={styles.srOnly}
                  type="file"
                  onChange={handleAttachment}
                />
                <button
                  className={styles.attachmentButton}
                  type="button"
                  aria-label="Add an attachment"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploading ? `${uploadProgress}%` : "+"}
                </button>
                <textarea
                  rows="1"
                  value={draft}
                  maxLength={5000}
                  placeholder={`Message ${activePartner?.name || ""}`}
                  aria-label="Message"
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button
                  className={styles.sendButton}
                  type="submit"
                  aria-label="Send message"
                  disabled={
                    (!draft.trim() && !pendingAttachment) ||
                    isSending ||
                    isUploading
                  }
                >
                  <SendIcon />
                </button>
              </form>
              {pendingAttachment && (
                <div className={styles.pendingAttachment}>
                  <span>{pendingAttachment.fileName}</span>
                  <button
                    type="button"
                    onClick={() => setPendingAttachment(null)}
                    aria-label="Remove attachment"
                  >
                    ×
                  </button>
                </div>
              )}
            </footer>
          </section>
        ) : (
          <section className={styles.emptyChat}>
            <div>
              <span className={styles.emptyMark}>R</span>
              <strong>Your conversations, in one place</strong>
              <p>
                Choose a conversation, share what matters, and turn it into a
                live Ripple when you are ready.
              </p>
              <button
                type="button"
                onClick={() => router.push("/dashboard/discover")}
              >
                Start a conversation
              </button>
            </div>
          </section>
        )}
      </section>
    </DashboardLayout>
  );
}

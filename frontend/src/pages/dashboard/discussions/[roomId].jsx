import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useSelector } from "react-redux";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { clientServer } from "@/config";
import { getSocket } from "@/config/socket";
import styles from "@/styles/discussionRoom.module.css";

const MicIcon = ({ off = false }) => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.7" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9.75V6a3 3 0 0 1 6 0v6a3 3 0 0 1-5.12 2.12M5.25 10.5v1.5a6.75 6.75 0 0 0 11.57 4.74M12 18.75V22m-3 0h6M3 3l18 18" opacity={off ? 1 : 0} />
    {!off && <><path strokeLinecap="round" strokeLinejoin="round" d="M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0V6Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 10.5V12a6.75 6.75 0 0 0 13.5 0v-1.5M12 18.75V22m-3 0h6" /></>}
  </svg>
);

const initials = (name = "Ripple member") =>
  name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
const QUICK_EMOJIS = ["👏", "❤️", "😂", "🔥", "💯", "🤯", "🙌", "👍", "🎉", "💡", "🤝", "🌊"];
const formatChatTime = (value) =>
  new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

function RemoteAudio({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
    ref.current.play().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

export default function DiscussionRoomPage() {
  const router = useRouter();
  const profile = useSelector((state) => state.auth.user);
  const currentUser = profile?.userId || profile;
  const currentUserId = currentUser?._id?.toString();
  const [room, setRoom] = useState(null);
  const [media, setMedia] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [role, setRole] = useState("listener");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ended, setEnded] = useState(false);
  const [audioStatus, setAudioStatus] = useState("idle");
  const [remoteAudio, setRemoteAudio] = useState([]);
  const [sidePanel, setSidePanel] = useState("chat");
  const [messages, setMessages] = useState([]);
  const [chatDraft, setChatDraft] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const chatEndRef = useRef(null);
  const publishPeerRef = useRef(null);
  const publishSessionRef = useRef("");
  const localStreamRef = useRef(null);
  const subscribePeerRef = useRef(null);
  const subscribeSessionRef = useRef("");
  const subscribedTracksRef = useRef(new Set());
  const trackOwnersRef = useRef(new Map());
  const subscriptionQueueRef = useRef(Promise.resolve());

  const me = participants.find((person) => person.userId === currentUserId);
  const isHost = role === "host";
  const speakers = participants.filter((person) => person.role !== "listener");
  const audience = participants.filter((person) => person.role === "listener");
  const requests = audience.filter((person) => person.requestedToSpeak);

  const createPeerConnection = () =>
    new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      bundlePolicy: "max-bundle",
    });

  const ensureSubscriber = useCallback(async () => {
    if (subscribePeerRef.current && subscribeSessionRef.current) {
      return {
        peer: subscribePeerRef.current,
        sessionId: subscribeSessionRef.current,
      };
    }
    const roomId = router.query.roomId;
    const response = await clientServer.post(
      `/discussion-rooms/${roomId}/media/sessions`,
      { purpose: "subscribe" }
    );
    const peer = createPeerConnection();
    peer.ontrack = ({ track, transceiver }) => {
      const owner = trackOwnersRef.current.get(transceiver.mid);
      const key = owner
        ? `${owner.sessionId}:${owner.trackName}`
        : `${transceiver.mid}:${track.id}`;
      const stream = new MediaStream([track]);
      setRemoteAudio((current) => [
        ...current.filter((entry) => entry.key !== key),
        { key, stream },
      ]);
      track.onended = () => {
        setRemoteAudio((current) => current.filter((entry) => entry.key !== key));
      };
    };
    subscribePeerRef.current = peer;
    subscribeSessionRef.current = response.data.sessionId;
    return { peer, sessionId: response.data.sessionId };
  }, [router.query.roomId]);

  const subscribeToTrack = useCallback((track) => {
    if (
      !track?.sessionId ||
      !track?.trackName ||
      track.userId === currentUserId
    ) return;
    const key = `${track.sessionId}:${track.trackName}`;
    if (subscribedTracksRef.current.has(key)) return;
    subscribedTracksRef.current.add(key);

    subscriptionQueueRef.current = subscriptionQueueRef.current
      .then(async () => {
        const roomId = router.query.roomId;
        const { peer, sessionId } = await ensureSubscriber();
        const response = await clientServer.post(
          `/discussion-rooms/${roomId}/media/sessions/${sessionId}/subscribe`,
          {
            sourceSessionId: track.sessionId,
            trackName: track.trackName,
          }
        );
        const remoteDescription = response.data.sessionDescription;
        const receivedTrack = response.data.tracks?.[0];
        if (receivedTrack?.mid) {
          trackOwnersRef.current.set(receivedTrack.mid, track);
        }
        if (response.data.requiresImmediateRenegotiation && remoteDescription) {
          await peer.setRemoteDescription(remoteDescription);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await clientServer.put(
            `/discussion-rooms/${roomId}/media/sessions/${sessionId}/renegotiate`,
            {
              sessionDescription: {
                sdp: peer.localDescription.sdp,
                type: peer.localDescription.type,
              },
            }
          );
        }
      })
      .catch((subscriptionError) => {
        subscribedTracksRef.current.delete(key);
        setError(
          subscriptionError.response?.data?.message ||
          "Could not connect to a speaker's audio."
        );
      });
  }, [currentUserId, ensureSubscriber, router.query.roomId]);

  const leave = useCallback(() => {
    const socket = getSocket();
    if (socket && router.query.roomId) {
      socket.emit("discussion:leave", { roomId: router.query.roomId });
    }
    router.push("/dashboard");
  }, [router]);

  useEffect(() => {
    if (!router.isReady) return undefined;
    let active = true;
    const socket = getSocket();
    const roomId = router.query.roomId;

    const handleState = (payload) => {
      if (payload.roomId === roomId) setParticipants(payload.participants || []);
    };
    const handleEnded = (payload) => {
      if (payload.roomId === roomId) setEnded(true);
    };
    const handleRemoved = (payload) => {
      if (payload.roomId === roomId) {
        setError("The host removed you from this discussion.");
        setEnded(true);
      }
    };
    const handlePromoted = (payload) => {
      if (payload.roomId === roomId) setRole("speaker");
    };
    const handleForceMute = (payload) => {
      if (payload.roomId === roomId) {
        localStreamRef.current?.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
        setError("The host muted your microphone.");
      }
    };
    const handleMediaTrack = (track) => {
      if (track.roomId === roomId) subscribeToTrack(track);
    };
    const handleMediaClosed = ({ sessionId }) => {
      if (sessionId === publishSessionRef.current) {
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        publishPeerRef.current?.close();
        localStreamRef.current = null;
        publishPeerRef.current = null;
        publishSessionRef.current = "";
        setAudioStatus("muted");
      }
      [...subscribedTracksRef.current].forEach((key) => {
        if (key.startsWith(`${sessionId}:`)) {
          subscribedTracksRef.current.delete(key);
        }
      });
      setRemoteAudio((current) =>
        current.filter((entry) => !entry.key.startsWith(`${sessionId}:`))
      );
    };
    const handleChatMessage = ({ message }) => {
      if (message?.roomId?.toString() !== roomId) return;
      setMessages((current) =>
        current.some((item) => item._id === message._id)
          ? current
          : [...current, message]
      );
    };
    const handleChatUpdated = ({ messageId, reactions }) => {
      setMessages((current) =>
        current.map((message) =>
          message._id === messageId ? { ...message, reactions } : message
        )
      );
    };
    const handleChatDeleted = ({ messageId, deletedAt }) => {
      setMessages((current) =>
        current.map((message) =>
          message._id === messageId
            ? {
                ...message,
                body: "Message removed",
                deletedAt,
                reactions: [],
              }
            : message
        )
      );
    };

    const load = async () => {
      try {
        const [response, messagesResponse] = await Promise.all([
          clientServer.get(`/discussion-rooms/${roomId}`),
          clientServer.get(`/discussion-rooms/${roomId}/messages`),
        ]);
        if (!active) return;
        setRoom(response.data.room);
        setMedia(response.data.media);
        setMessages(messagesResponse.data.messages || []);
        if (response.data.room.status === "ended") {
          setEnded(true);
          return;
        }
        socket?.on("discussion:state", handleState);
        socket?.on("discussion:ended", handleEnded);
        socket?.on("discussion:removed", handleRemoved);
        socket?.on("discussion:promoted", handlePromoted);
        socket?.on("discussion:force-mute", handleForceMute);
        socket?.on("discussion:media-track", handleMediaTrack);
        socket?.on("discussion:media-closed", handleMediaClosed);
        socket?.on("discussion:message:new", handleChatMessage);
        socket?.on("discussion:message:updated", handleChatUpdated);
        socket?.on("discussion:message:deleted", handleChatDeleted);
        socket?.emit("discussion:join", { roomId }, (result) => {
          if (!result?.ok) setError(result?.message || "Could not join the room.");
          else setRole(result.role);
        });
        if (response.data.media?.configured) {
          const tracksResponse = await clientServer.get(
            `/discussion-rooms/${roomId}/media/tracks`
          );
          tracksResponse.data.tracks?.forEach(subscribeToTrack);
        }
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || "Could not load the discussion.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();

    return () => {
      active = false;
      socket?.emit("discussion:leave", { roomId });
      socket?.off("discussion:state", handleState);
      socket?.off("discussion:ended", handleEnded);
      socket?.off("discussion:removed", handleRemoved);
      socket?.off("discussion:promoted", handlePromoted);
      socket?.off("discussion:force-mute", handleForceMute);
      socket?.off("discussion:media-track", handleMediaTrack);
      socket?.off("discussion:media-closed", handleMediaClosed);
      socket?.off("discussion:message:new", handleChatMessage);
      socket?.off("discussion:message:updated", handleChatUpdated);
      socket?.off("discussion:message:deleted", handleChatDeleted);
      const sessions = [
        publishSessionRef.current,
        subscribeSessionRef.current,
      ].filter(Boolean);
      sessions.forEach((sessionId) => {
        clientServer.delete(
          `/discussion-rooms/${roomId}/media/sessions/${sessionId}`
        ).catch(() => {});
      });
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      publishPeerRef.current?.close();
      subscribePeerRef.current?.close();
    };
  }, [router.isReady, router.query.roomId, subscribeToTrack]);

  useEffect(() => {
    if (me?.role === "listener") {
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }
  }, [me?.role]);

  useEffect(() => {
    if (sidePanel === "chat") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, sidePanel]);

  const postExcerpt = useMemo(() => {
    const body = room?.postId?.body || "";
    return body.length > 150 ? `${body.slice(0, 150)}…` : body;
  }, [room]);

  const requestToSpeak = () => {
    getSocket()?.emit("discussion:request-speak", { roomId: room._id });
  };
  const decide = (userId, approved) => {
    getSocket()?.emit("discussion:speaker-decision", {
      roomId: room._id,
      userId,
      approved,
    });
  };
  const moderate = (userId, action) => {
    getSocket()?.emit("discussion:moderate", { roomId: room._id, userId, action });
  };
  const endRoom = () => {
    getSocket()?.emit("discussion:end", { roomId: room._id }, (result) => {
      if (!result?.ok) setError(result?.message || "Could not end the discussion.");
    });
  };

  const sendChatMessage = () => {
    const body = chatDraft.trim();
    if (!body || sendingChat || ended) return;
    setSendingChat(true);
    getSocket()?.emit(
      "discussion:message",
      { roomId: room._id, body },
      (result) => {
        setSendingChat(false);
        if (result?.ok) {
          setChatDraft("");
          setShowEmojis(false);
        } else {
          setError(result?.message || "Could not send the message.");
        }
      }
    );
  };

  const reactToMessage = (messageId, emoji) => {
    getSocket()?.emit(
      "discussion:message:react",
      { roomId: room._id, messageId, emoji },
      (result) => {
        if (!result?.ok) setError(result?.message || "Could not add reaction.");
      }
    );
  };

  const deleteChatMessage = (messageId) => {
    getSocket()?.emit(
      "discussion:message:delete",
      { roomId: room._id, messageId },
      (result) => {
        if (!result?.ok) setError(result?.message || "Could not remove message.");
      }
    );
  };

  const toggleMicrophone = async () => {
    if (!media?.configured || audioStatus === "connecting") return;
    const shouldUnmute = me?.muted !== false;
    setError("");
    try {
      if (shouldUnmute && !localStreamRef.current) {
        setAudioStatus("connecting");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        const sessionResponse = await clientServer.post(
          `/discussion-rooms/${room._id}/media/sessions`,
          { purpose: "publish" }
        );
        const peer = createPeerConnection();
        const audioTrack = stream.getAudioTracks()[0];
        audioTrack.enabled = false;
        const transceiver = peer.addTransceiver(audioTrack, {
          direction: "sendonly",
        });
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        const publishResponse = await clientServer.post(
          `/discussion-rooms/${room._id}/media/sessions/${sessionResponse.data.sessionId}/publish`,
          {
            mid: transceiver.mid,
            sessionDescription: {
              sdp: peer.localDescription.sdp,
              type: peer.localDescription.type,
            },
          }
        );
        await peer.setRemoteDescription(
          publishResponse.data.sessionDescription
        );
        localStreamRef.current = stream;
        publishPeerRef.current = peer;
        publishSessionRef.current = sessionResponse.data.sessionId;
      }

      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = shouldUnmute;
      });
      getSocket()?.emit("discussion:toggle-mute", {
        roomId: room._id,
        muted: !shouldUnmute,
      });
      setAudioStatus(shouldUnmute ? "live" : "muted");
    } catch (mediaError) {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      publishPeerRef.current?.close();
      publishPeerRef.current = null;
      setAudioStatus("error");
      setError(
        mediaError.response?.data?.message ||
        (mediaError.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : "Could not connect your microphone.")
      );
    }
  };

  if (loading) return <DashboardLayout wide><div className={styles.state}>Entering discussion…</div></DashboardLayout>;
  if (!room || error && !participants.length) {
    return <DashboardLayout wide><div className={styles.state}><h1>Discussion unavailable</h1><p>{error}</p><Link href="/dashboard">Back to posts</Link></div></DashboardLayout>;
  }

  return (
    <DashboardLayout wide>
      <section className={styles.shell}>
        <div className={styles.remoteAudio} aria-hidden="true">
          {remoteAudio.map((entry) => (
            <RemoteAudio key={entry.key} stream={entry.stream} />
          ))}
        </div>
        <header className={styles.topbar}>
          <button type="button" onClick={leave}>← Leave quietly</button>
          <div className={styles.livePill}><i /> {ended ? "Ended" : "Live"}</div>
          <span>{participants.length} here</span>
        </header>

        <div className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>LIVE POST DISCUSSION</p>
            <h1>{room.title}</h1>
            <p>{postExcerpt}</p>
          </div>
          <Link href={`/dashboard/posts/${room.postId?._id}`}>View original post ↗</Link>
        </div>

        {!media?.configured && !ended && (
          <div className={styles.setupNotice}>
            <strong>The room and stage are live. Audio needs the SFU key.</strong>
            <span>Your TURN key handles connection fallback; group audio needs a Cloudflare Realtime App ID and secret on the backend.</span>
          </div>
        )}
        {error && <div className={styles.error}>{error}</div>}

        <main className={styles.content}>
          <section className={styles.stage}>
            <div className={styles.sectionHeading}>
              <div><span>On stage</span><small>{speakers.length} speaker{speakers.length === 1 ? "" : "s"}</small></div>
              <div className={styles.soundBars}><i /><i /><i /><i /></div>
            </div>
            <div className={styles.speakerGrid}>
              {speakers.map((person) => (
                <article className={styles.speaker} key={person.userId}>
                  <div className={`${styles.largeAvatar} ${!person.muted ? styles.unmutedHalo : ""}`}>
                    {person.profilePicture && person.profilePicture !== "default.jpg"
                      ? <img src={person.profilePicture} alt="" />
                      : initials(person.name)}
                    <span className={person.muted ? styles.muted : styles.unmuted}><MicIcon off={person.muted} /></span>
                  </div>
                  <strong>{person.name}</strong>
                  <small>{person.role === "host" ? "Host" : "Speaker"}</small>
                  {isHost && person.role !== "host" && (
                    <div className={styles.moderation}>
                      <button type="button" onClick={() => moderate(person.userId, "mute")}>Mute</button>
                      <button type="button" onClick={() => moderate(person.userId, "move-to-audience")}>Audience</button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>

          <aside className={styles.audiencePanel}>
            <div className={styles.panelTabs} role="tablist">
              <button className={sidePanel === "chat" ? styles.activeTab : ""} type="button" role="tab" aria-selected={sidePanel === "chat"} onClick={() => setSidePanel("chat")}>
                Live chat <span>{messages.length}</span>
              </button>
              <button className={sidePanel === "people" ? styles.activeTab : ""} type="button" role="tab" aria-selected={sidePanel === "people"} onClick={() => setSidePanel("people")}>
                People <span>{participants.length}</span>
              </button>
            </div>

            {sidePanel === "people" ? (
              <div className={styles.peoplePanel}>
                {isHost && requests.length > 0 && (
                  <div className={styles.requests}>
                    <div className={styles.panelTitle}><strong>Speaker requests</strong><span>{requests.length}</span></div>
                    {requests.map((person) => (
                      <div className={styles.requestRow} key={person.userId}>
                        <span>{initials(person.name)}</span><strong>{person.name}</strong>
                        <button type="button" onClick={() => decide(person.userId, true)}>Invite</button>
                        <button type="button" onClick={() => decide(person.userId, false)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.panelTitle}><strong>In the room</strong><span>{audience.length}</span></div>
                <div className={styles.audienceList}>
                  {audience.map((person) => (
                    <div className={styles.audienceRow} key={person.userId}>
                      <span>{initials(person.name)}</span>
                      <div><strong>{person.name}</strong><small>@{person.username}</small></div>
                      {person.requestedToSpeak && <i>Hand raised</i>}
                      {isHost && <button type="button" onClick={() => moderate(person.userId, "remove")}>•••</button>}
                    </div>
                  ))}
                  {!audience.length && <p>The audience will appear here.</p>}
                </div>
              </div>
            ) : (
              <div className={styles.chatPanel}>
                <div className={styles.chatStream} aria-live="polite">
                  {!messages.length && (
                    <div className={styles.emptyChat}>
                      <span>👋</span>
                      <strong>Start the conversation</strong>
                      <p>React to what’s being said and make everyone feel welcome.</p>
                    </div>
                  )}
                  {messages.map((message) => {
                    const sender = message.senderId || {};
                    const senderId = (sender._id || sender).toString();
                    const canDelete = isHost || senderId === currentUserId;
                    return (
                      <article className={`${styles.chatMessage} ${senderId === currentUserId ? styles.ownChatMessage : ""}`} key={message._id}>
                        <span className={styles.chatAvatar}>
                          {sender.profilePicture && sender.profilePicture !== "default.jpg"
                            ? <img src={sender.profilePicture} alt="" />
                            : initials(sender.name)}
                        </span>
                        <div className={styles.chatBubble}>
                          <header>
                            <strong>{sender.name || "Ripple member"}</strong>
                            <time>{formatChatTime(message.createdAt)}</time>
                            {canDelete && !message.deletedAt && (
                              <button type="button" aria-label="Remove message" onClick={() => deleteChatMessage(message._id)}>•••</button>
                            )}
                          </header>
                          <p className={message.deletedAt ? styles.deletedMessage : ""}>{message.body}</p>
                          {!message.deletedAt && (
                            <div className={styles.messageReactions}>
                              {(message.reactions || []).map((reaction) => {
                                const mine = reaction.userIds?.some(
                                  (id) => (id._id || id).toString() === currentUserId
                                );
                                return (
                                  <button className={mine ? styles.myReaction : ""} type="button" key={reaction.emoji} onClick={() => reactToMessage(message._id, reaction.emoji)}>
                                    {reaction.emoji} <span>{reaction.userIds?.length || 0}</span>
                                  </button>
                                );
                              })}
                              <div className={styles.quickReact}>
                                {["👏", "❤️", "😂", "🔥"].map((emoji) => (
                                  <button type="button" key={emoji} onClick={() => reactToMessage(message._id, emoji)}>{emoji}</button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>

                <div className={styles.chatComposer}>
                  {showEmojis && (
                    <div className={styles.emojiPicker}>
                      {QUICK_EMOJIS.map((emoji) => (
                        <button type="button" key={emoji} onClick={() => setChatDraft((draft) => `${draft}${emoji}`)}>{emoji}</button>
                      ))}
                    </div>
                  )}
                  <div>
                    <button className={styles.emojiButton} type="button" aria-label="Choose emoji" aria-expanded={showEmojis} onClick={() => setShowEmojis((open) => !open)}>☺</button>
                    <textarea value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder={ended ? "Discussion ended" : "Say something thoughtful…"} maxLength={1000} rows={1} disabled={ended} />
                    <button className={styles.sendChat} type="button" onClick={sendChatMessage} disabled={!chatDraft.trim() || sendingChat || ended} aria-label="Send message">↑</button>
                  </div>
                  <small>{chatDraft.length ? `${chatDraft.length}/1000` : "Be kind. This chat is shared with everyone."}</small>
                </div>
              </div>
            )}
          </aside>
        </main>

        <footer className={styles.controls}>
          {ended ? (
            <div><strong>This discussion has ended</strong><button type="button" onClick={leave}>Back to posts</button></div>
          ) : (
            <>
              <div className={styles.you}><span>{initials(currentUser?.name)}</span><div><strong>You</strong><small>{role}</small></div></div>
              {role === "listener" ? (
                <button className={me?.requestedToSpeak ? styles.raised : styles.primary} type="button" onClick={requestToSpeak}>
                  {me?.requestedToSpeak ? "Lower hand" : "Request to speak"}
                </button>
              ) : (
                <button className={styles.micButton} type="button" disabled={!media?.configured || audioStatus === "connecting"} onClick={toggleMicrophone} title={!media?.configured ? "Configure Cloudflare Realtime SFU first" : ""}>
                  <MicIcon off={me?.muted} /> {audioStatus === "connecting" ? "Connecting…" : me?.muted ? "Unmute" : "Mute"}
                </button>
              )}
              {isHost && <button className={styles.endButton} type="button" onClick={endRoom}>End room</button>}
            </>
          )}
        </footer>
      </section>
    </DashboardLayout>
  );
}

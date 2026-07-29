import { useCallback, useEffect, useMemo, useState } from "react";
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

  const me = participants.find((person) => person.userId === currentUserId);
  const isHost = role === "host";
  const speakers = participants.filter((person) => person.role !== "listener");
  const audience = participants.filter((person) => person.role === "listener");
  const requests = audience.filter((person) => person.requestedToSpeak);

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
      if (payload.roomId === roomId) setError("The host muted your microphone.");
    };

    const load = async () => {
      try {
        const response = await clientServer.get(`/discussion-rooms/${roomId}`);
        if (!active) return;
        setRoom(response.data.room);
        setMedia(response.data.media);
        if (response.data.room.status === "ended") {
          setEnded(true);
          return;
        }
        socket?.on("discussion:state", handleState);
        socket?.on("discussion:ended", handleEnded);
        socket?.on("discussion:removed", handleRemoved);
        socket?.on("discussion:promoted", handlePromoted);
        socket?.on("discussion:force-mute", handleForceMute);
        socket?.emit("discussion:join", { roomId }, (result) => {
          if (!result?.ok) setError(result?.message || "Could not join the room.");
          else setRole(result.role);
        });
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
    };
  }, [router.isReady, router.query.roomId]);

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

  if (loading) return <DashboardLayout wide><div className={styles.state}>Entering discussion…</div></DashboardLayout>;
  if (!room || error && !participants.length) {
    return <DashboardLayout wide><div className={styles.state}><h1>Discussion unavailable</h1><p>{error}</p><Link href="/dashboard">Back to posts</Link></div></DashboardLayout>;
  }

  return (
    <DashboardLayout wide>
      <section className={styles.shell}>
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
                  <div className={styles.largeAvatar}>
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
                <button className={styles.micButton} type="button" disabled={!media?.configured} title={!media?.configured ? "Configure Cloudflare Realtime SFU first" : ""}>
                  <MicIcon off={me?.muted} /> {me?.muted ? "Unmute" : "Mute"}
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

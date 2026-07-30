import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/config/socket";
import { clientServer } from "@/config";
import styles from "./CallManager.module.css";

const FALLBACK_ICE_SERVERS = [
  {
    urls:
      process.env.NEXT_PUBLIC_STUN_URL ||
      "stun:stun.l.google.com:19302",
  },
];

const initialCall = {
  callId: null,
  conversationId: null,
  direction: null,
  mode: "audio",
  peer: null,
  status: "idle",
  notice: "",
};

const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "R";

const MicIcon = ({ muted = false }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 15a4 4 0 0 0 4-4V6a4 4 0 1 0-8 0v5a4 4 0 0 0 4 4Z" />
    <path d="M19 10v1a7 7 0 0 1-12 4.9M5 10v1a7 7 0 0 0 .5 2.6M12 18v4M9 22h6" />
    {muted && <path d="m3 3 18 18" />}
  </svg>
);

const CameraIcon = ({ off = false }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15 10 21 7v10l-6-3v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3Z" />
    {off && <path d="m3 3 18 18" />}
  </svg>
);

const ScreenIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 17v4M9 10l3-3 3 3M12 7v7" />
  </svg>
);

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2.1Z" />
  </svg>
);

const SummaryIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" />
    <path d="m18.5 13 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2ZM5 14l.7 2.3L8 17l-2.3.7L5 20l-.7-2.3L2 17l2.3-.7L5 14Z" />
  </svg>
);

export default function CallManager() {
  const [call, setCall] = useState(initialCall);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [hasLocalMedia, setHasLocalMedia] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteIsSharing, setRemoteIsSharing] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [summaryState, setSummaryState] = useState("idle");
  const callRef = useRef(initialCall);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const queuedCandidatesRef = useRef([]);
  const cameraTrackRef = useRef(null);
  const screenStreamRef = useRef(null);
  const summaryStateRef = useRef("idle");
  const summaryRecorderRef = useRef(null);
  const summaryChunksRef = useRef([]);
  const summaryAudioContextRef = useRef(null);
  const isSummaryRecorderRef = useRef(false);
  const iceServersRef = useRef(FALLBACK_ICE_SERVERS);

  const loadIceServers = useCallback(async () => {
    try {
      const response = await clientServer.get("/calls/ice-servers");
      if (Array.isArray(response.data.iceServers)) {
        iceServersRef.current = response.data.iceServers;
      }
    } catch {
      iceServersRef.current = FALLBACK_ICE_SERVERS;
    }
  }, []);

  const updateCall = useCallback((value) => {
    const next =
      typeof value === "function" ? value(callRef.current) : value;
    callRef.current = next;
    setCall(next);
  }, []);

  const updateSummaryState = useCallback((status) => {
    summaryStateRef.current = status;
    setSummaryState(status);
  }, []);

  const startSummaryRecording = useCallback(async () => {
    if (
      typeof MediaRecorder === "undefined" ||
      !localStreamRef.current ||
      !remoteStreamRef.current
    ) {
      throw new Error("Call recording is not supported.");
    }

    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Audio mixing is not supported.");
    }
    const audioContext = new AudioContextClass();
    const destination = audioContext.createMediaStreamDestination();
    [localStreamRef.current, remoteStreamRef.current].forEach((stream) => {
      if (stream.getAudioTracks().length) {
        audioContext.createMediaStreamSource(stream).connect(destination);
      }
    });
    await audioContext.resume();

    const mimeType = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "video/webm;codecs=opus",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(destination.stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 48000,
    });
    summaryAudioContextRef.current = audioContext;
    summaryRecorderRef.current = recorder;
    summaryChunksRef.current = [];
    recorder.ondataavailable = ({ data }) => {
      if (data.size) summaryChunksRef.current.push(data);
    };
    recorder.start(1000);
  }, []);

  const stopSummaryRecording = useCallback(
    () =>
      new Promise((resolve) => {
        const recorder = summaryRecorderRef.current;
        if (!recorder || recorder.state === "inactive") {
          resolve(null);
          return;
        }
        recorder.onstop = async () => {
          const blob = new Blob(summaryChunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          summaryChunksRef.current = [];
          summaryRecorderRef.current = null;
          await summaryAudioContextRef.current?.close().catch(() => {});
          summaryAudioContextRef.current = null;
          resolve(blob);
        };
        recorder.stop();
      }),
    []
  );

  const stopMedia = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    screenStreamRef.current = null;
    cameraTrackRef.current = null;
    setHasLocalMedia(false);
    setIsScreenSharing(false);
    setRemoteIsSharing(false);
  }, []);

  const resetCall = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    queuedCandidatesRef.current = [];
    stopMedia();
    setIsMuted(false);
    setIsCameraOff(false);
    setCallSeconds(0);
    updateSummaryState("idle");
    isSummaryRecorderRef.current = false;
    updateCall(initialCall);
  }, [stopMedia, updateCall, updateSummaryState]);

  const showEndedState = useCallback(
    (notice) => {
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      stopMedia();
      updateCall((current) => ({
        ...current,
        status: "ended",
        notice,
      }));
      window.setTimeout(() => {
        if (callRef.current.status === "ended") resetCall();
      }, 1800);
    },
    [resetCall, stopMedia, updateCall]
  );

  const acquireMedia = useCallback(async (mode) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Calling is not supported by this browser.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: mode === "video",
    });
    localStreamRef.current = stream;
    cameraTrackRef.current = stream.getVideoTracks()[0] || null;
    setHasLocalMedia(true);
    return stream;
  }, []);

  const createPeerConnection = useCallback(
    (callId) => {
      peerConnectionRef.current?.close();
      const connection = new RTCPeerConnection({
        iceServers: iceServersRef.current,
      });
      peerConnectionRef.current = connection;
      remoteStreamRef.current = new MediaStream();

      localStreamRef.current?.getTracks().forEach((track) => {
        connection.addTrack(track, localStreamRef.current);
      });
      connection.ontrack = ({ streams, track }) => {
        const stream = streams[0];
        if (stream) {
          remoteStreamRef.current = stream;
        } else {
          remoteStreamRef.current.addTrack(track);
        }
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStreamRef.current;
        }
        updateCall((current) => ({ ...current, status: "active" }));
      };
      connection.onicecandidate = ({ candidate }) => {
        if (candidate) {
          getSocket()?.emit("call:ice-candidate", {
            callId,
            candidate,
          });
        }
      };
      connection.oniceconnectionstatechange = () => {
        if (["failed", "closed"].includes(connection.iceConnectionState)) {
          showEndedState("Call disconnected");
        }
      };
      return connection;
    },
    [showEndedState, updateCall]
  );

  const addQueuedCandidates = useCallback(async (connection) => {
    const candidates = queuedCandidatesRef.current;
    queuedCandidatesRef.current = [];
    for (const candidate of candidates) {
      await connection.addIceCandidate(candidate);
    }
  }, []);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
    }
  }, [call.status, call.mode]);

  useEffect(() => {
    if (call.status !== "active") return undefined;
    const intervalId = window.setInterval(
      () => setCallSeconds((seconds) => seconds + 1),
      1000
    );
    return () => window.clearInterval(intervalId);
  }, [call.status]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const startCall = async ({ detail = {} }) => {
      if (callRef.current.status !== "idle") return;
      const mode = detail.mode === "video" ? "video" : "audio";
      updateCall({
        callId: null,
        conversationId: detail.conversationId,
        direction: "outgoing",
        mode,
        peer: detail.peer,
        status: "requesting-media",
        notice: "",
      });

      try {
        await loadIceServers();
        await acquireMedia(mode);
      } catch (error) {
        showEndedState(error.message || "Camera or microphone access was denied.");
        return;
      }

      updateCall((current) => ({ ...current, status: "ringing" }));
      socket.timeout(8000).emit(
        "call:invite",
        {
          conversationId: detail.conversationId,
          targetUserId: detail.peer?._id,
          mode,
        },
        (timeoutError, response) => {
          if (timeoutError || !response?.ok) {
            showEndedState(
              response?.message || "The call could not be started."
            );
            return;
          }
          updateCall((current) => ({
            ...current,
            callId: response.callId,
          }));
        }
      );
    };

    const handleIncoming = (incoming) => {
      if (callRef.current.status !== "idle") {
        socket.emit("call:reject", { callId: incoming.callId });
        return;
      }
      updateCall({
        callId: incoming.callId,
        conversationId: incoming.conversationId,
        direction: "incoming",
        mode: incoming.mode,
        peer: incoming.caller,
        status: "incoming",
        notice: "",
      });
    };

    const handleAccepted = async ({ callId }) => {
      if (callRef.current.callId !== callId) return;
      try {
        const connection = createPeerConnection(callId);
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        socket.emit("call:offer", {
          callId,
          description: connection.localDescription,
        });
        updateCall((current) => ({ ...current, status: "connecting" }));
      } catch {
        socket.emit("call:end", { callId });
        showEndedState("Could not establish the call.");
      }
    };

    const handleOffer = async ({ callId, description }) => {
      if (callRef.current.callId !== callId) return;
      try {
        const connection =
          peerConnectionRef.current || createPeerConnection(callId);
        await connection.setRemoteDescription(description);
        await addQueuedCandidates(connection);
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        socket.emit("call:answer", {
          callId,
          description: connection.localDescription,
        });
      } catch {
        socket.emit("call:end", { callId });
        showEndedState("Could not establish the call.");
      }
    };

    const handleAnswer = async ({ callId, description }) => {
      if (
        callRef.current.callId !== callId ||
        !peerConnectionRef.current
      ) {
        return;
      }
      try {
        await peerConnectionRef.current.setRemoteDescription(description);
        await addQueuedCandidates(peerConnectionRef.current);
      } catch {
        socket.emit("call:end", { callId });
        showEndedState("Could not establish the call.");
      }
    };

    const handleCandidate = async ({ callId, candidate }) => {
      if (callRef.current.callId !== callId || !candidate) return;
      const connection = peerConnectionRef.current;
      if (!connection?.remoteDescription) {
        queuedCandidatesRef.current.push(candidate);
        return;
      }
      try {
        await connection.addIceCandidate(candidate);
      } catch {
        // A later candidate can still establish the connection.
      }
    };

    const handleScreenShare = ({ callId, active }) => {
      if (callRef.current.callId !== callId) return;
      setRemoteIsSharing(Boolean(active));
    };

    const handleEnded = async ({
      callId,
      reason,
      historyMessageId,
    }) => {
      if (callRef.current.callId !== callId) return;
      const recording = isSummaryRecorderRef.current
        ? await stopSummaryRecording()
        : null;
      const notices = {
        declined: "Call declined",
        missed: "No answer",
        disconnected: "Call disconnected",
      };
      showEndedState(notices[reason] || "Call ended");

      if (recording?.size && historyMessageId) {
        const form = new FormData();
        form.append("recording", recording, "ripple-call.webm");
        clientServer
          .post(`/calls/${historyMessageId}/summary`, form)
          .catch(() => {
            // The summary card receives its failed state over the socket.
          });
      }
    };

    const handleTaken = ({ callId }) => {
      if (
        callRef.current.callId === callId &&
        callRef.current.status === "incoming"
      ) {
        resetCall();
      }
    };
    const handleSocketDisconnect = () => {
      if (callRef.current.status !== "idle") {
        stopSummaryRecording();
        showEndedState("Call disconnected");
      }
    };
    const handleSummaryRequested = ({ callId }) => {
      if (callRef.current.callId === callId) {
        updateSummaryState("requested");
      }
    };
    const handleSummaryConsentRequest = ({ callId }) => {
      if (callRef.current.callId === callId) {
        updateSummaryState("consent");
      }
    };
    const handleSummaryApproved = async ({ callId, recorder }) => {
      if (callRef.current.callId !== callId) return;
      isSummaryRecorderRef.current = Boolean(recorder);
      try {
        if (recorder) await startSummaryRecording();
        updateSummaryState("recording");
      } catch {
        socket.emit("call:summary-cancel", { callId });
      }
    };
    const handleSummaryDeclined = ({ callId }) => {
      if (callRef.current.callId === callId) {
        isSummaryRecorderRef.current = false;
        updateSummaryState("declined");
      }
    };

    window.addEventListener("ripple:start-call", startCall);
    socket.on("call:incoming", handleIncoming);
    socket.on("call:accepted", handleAccepted);
    socket.on("call:offer", handleOffer);
    socket.on("call:answer", handleAnswer);
    socket.on("call:ice-candidate", handleCandidate);
    socket.on("call:screen-share", handleScreenShare);
    socket.on("call:ended", handleEnded);
    socket.on("call:taken", handleTaken);
    socket.on("disconnect", handleSocketDisconnect);
    socket.on("call:summary-requested", handleSummaryRequested);
    socket.on(
      "call:summary-consent-request",
      handleSummaryConsentRequest
    );
    socket.on("call:summary-approved", handleSummaryApproved);
    socket.on("call:summary-declined", handleSummaryDeclined);

    return () => {
      window.removeEventListener("ripple:start-call", startCall);
      socket.off("call:incoming", handleIncoming);
      socket.off("call:accepted", handleAccepted);
      socket.off("call:offer", handleOffer);
      socket.off("call:answer", handleAnswer);
      socket.off("call:ice-candidate", handleCandidate);
      socket.off("call:screen-share", handleScreenShare);
      socket.off("call:ended", handleEnded);
      socket.off("call:taken", handleTaken);
      socket.off("disconnect", handleSocketDisconnect);
      socket.off("call:summary-requested", handleSummaryRequested);
      socket.off(
        "call:summary-consent-request",
        handleSummaryConsentRequest
      );
      socket.off("call:summary-approved", handleSummaryApproved);
      socket.off("call:summary-declined", handleSummaryDeclined);
    };
  }, [
    acquireMedia,
    addQueuedCandidates,
    createPeerConnection,
    loadIceServers,
    resetCall,
    showEndedState,
    startSummaryRecording,
    stopSummaryRecording,
    updateCall,
    updateSummaryState,
  ]);

  const acceptCall = async () => {
    const current = callRef.current;
    if (current.status !== "incoming") return;
    updateCall((value) => ({ ...value, status: "requesting-media" }));
    try {
      await loadIceServers();
      await acquireMedia(current.mode);
      createPeerConnection(current.callId);
      getSocket()?.emit(
        "call:accept",
        { callId: current.callId },
        (response) => {
          if (!response?.ok) {
            showEndedState(
              response?.message || "This call is no longer available."
            );
            return;
          }
          updateCall((value) => ({ ...value, status: "connecting" }));
        }
      );
    } catch (error) {
      getSocket()?.emit("call:reject", { callId: current.callId });
      showEndedState(
        error.message || "Camera or microphone access was denied."
      );
    }
  };

  const endCall = () => {
    const current = callRef.current;
    if (current.callId) {
      if (current.status === "incoming") {
        getSocket()?.emit("call:reject", { callId: current.callId });
      } else {
        getSocket()?.emit("call:end", { callId: current.callId });
      }
      updateCall((value) => ({ ...value, status: "ending" }));
      return;
    }
    resetCall();
  };

  const requestSummary = () => {
    if (callRef.current.status !== "active") return;
    getSocket()?.emit("call:summary-request", {
      callId: callRef.current.callId,
    });
  };

  const respondToSummary = (accepted) => {
    getSocket()?.emit("call:summary-consent", {
      callId: callRef.current.callId,
      accepted,
    });
    updateSummaryState(accepted ? "starting" : "declined");
  };

  const toggleMute = () => {
    const audioTracks = localStreamRef.current?.getAudioTracks() || [];
    const nextMuted = !isMuted;
    audioTracks.forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  const toggleCamera = () => {
    const videoTracks = cameraTrackRef.current
      ? [cameraTrackRef.current]
      : [];
    const nextCameraOff = !isCameraOff;
    videoTracks.forEach((track) => {
      track.enabled = !nextCameraOff;
    });
    setIsCameraOff(nextCameraOff);
  };

  const stopScreenShare = useCallback(async () => {
    if (!screenStreamRef.current) return;
    const sender = peerConnectionRef.current
      ?.getSenders()
      .find((item) => item.track?.kind === "video");
    const cameraTrack = cameraTrackRef.current;
    if (sender && cameraTrack) {
      await sender.replaceTrack(cameraTrack);
    }
    screenStreamRef.current.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    screenStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    setIsScreenSharing(false);
    if (callRef.current.callId) {
      getSocket()?.emit("call:screen-share", {
        callId: callRef.current.callId,
        active: false,
      });
    }
  }, []);

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }
    if (
      callRef.current.status !== "active" ||
      !navigator.mediaDevices?.getDisplayMedia
    ) {
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      const sender = peerConnectionRef.current
        ?.getSenders()
        .find((item) => item.track?.kind === "video");
      if (!screenTrack || !sender) {
        displayStream.getTracks().forEach((track) => track.stop());
        return;
      }

      await sender.replaceTrack(screenTrack);
      screenStreamRef.current = displayStream;
      screenTrack.onended = () => {
        stopScreenShare();
      };
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = displayStream;
      }
      setIsScreenSharing(true);
      getSocket()?.emit("call:screen-share", {
        callId: callRef.current.callId,
        active: true,
      });
    } catch {
      // Closing the browser's share picker is not an application error.
    }
  };

  if (call.status === "idle") return null;

  const hasPicture =
    call.peer?.profilePicture &&
    call.peer.profilePicture !== "default.jpg";
  const isIncoming = call.status === "incoming";
  const statusText = {
    incoming: `Incoming ${call.mode} call`,
    "requesting-media": "Waiting for permission…",
    ringing: "Ringing…",
    connecting: "Connecting securely…",
    active: "Connected",
    ending: "Ending call…",
    ended: call.notice,
  }[call.status];
  const duration = `${String(Math.floor(callSeconds / 60)).padStart(
    2,
    "0"
  )}:${String(callSeconds % 60).padStart(2, "0")}`;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <section
        className={`${styles.callWindow} ${
          call.mode === "video" ? styles.videoCall : styles.audioCall
        }`}
      >
        {call.mode === "video" && (
          <div className={styles.videoStage}>
            <video ref={remoteVideoRef} autoPlay playsInline />
            {remoteIsSharing && (
              <span className={styles.shareNotice}>
                {call.peer?.name || "Your connection"} is presenting
              </span>
            )}
            <video
              ref={localVideoRef}
              className={`${styles.localVideo} ${
                isScreenSharing ? styles.localScreen : ""
              }`}
              autoPlay
              playsInline
              muted
            />
          </div>
        )}
        {call.mode === "audio" && <audio ref={remoteAudioRef} autoPlay />}

        <div
          className={`${styles.callDetails} ${
            call.status === "active" ? styles.activeDetails : ""
          }`}
        >
          <span className={styles.callAvatar}>
            {hasPicture ? (
              <img src={call.peer.profilePicture} alt="" />
            ) : (
              initials(call.peer?.name)
            )}
          </span>
          <div className={styles.identity}>
            <strong>{call.peer?.name || "Ripple member"}</strong>
            <p>
              {statusText}
              {call.status === "active" ? ` · ${duration}` : ""}
            </p>
          </div>
          {summaryState === "recording" && (
            <span className={styles.recordingBadge}>
              <i />
              Summary recording on
            </span>
          )}
        </div>

        {summaryState === "consent" && (
          <div className={styles.consentPrompt}>
            <div>
              <strong>Allow a call summary?</strong>
              <span>
                Audio will be recorded and processed after the call. The raw
                recording will not be saved.
              </span>
            </div>
            <button type="button" onClick={() => respondToSummary(false)}>
              Not now
            </button>
            <button
              className={styles.allowSummary}
              type="button"
              onClick={() => respondToSummary(true)}
            >
              Allow
            </button>
          </div>
        )}

        <div className={styles.callControls}>
          {isIncoming ? (
            <>
              <button
                className={styles.decline}
                type="button"
                onClick={endCall}
              >
                <PhoneIcon />
                Decline
              </button>
              <button
                className={styles.accept}
                type="button"
                onClick={acceptCall}
              >
                <PhoneIcon />
                Accept
              </button>
            </>
          ) : (
            <>
              <button
                className={`${styles.controlButton} ${
                  isMuted ? styles.controlActive : ""
                }`}
                type="button"
                onClick={toggleMute}
                disabled={!hasLocalMedia}
                aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
              >
                <MicIcon muted={isMuted} />
                <span>{isMuted ? "Unmute" : "Mute"}</span>
              </button>
              {call.mode === "video" && (
                <>
                  <button
                    className={`${styles.controlButton} ${
                      isCameraOff ? styles.controlActive : ""
                    }`}
                    type="button"
                    onClick={toggleCamera}
                    disabled={!hasLocalMedia || isScreenSharing}
                    aria-label={
                      isCameraOff ? "Turn camera on" : "Turn camera off"
                    }
                  >
                    <CameraIcon off={isCameraOff} />
                    <span>{isCameraOff ? "Camera on" : "Camera"}</span>
                  </button>
                  <button
                    className={`${styles.controlButton} ${
                      isScreenSharing ? styles.sharing : ""
                    }`}
                    type="button"
                    onClick={toggleScreenShare}
                    disabled={call.status !== "active"}
                    aria-label={
                      isScreenSharing
                        ? "Stop sharing screen"
                        : "Share screen"
                    }
                  >
                    <ScreenIcon />
                    <span>{isScreenSharing ? "Stop share" : "Share"}</span>
                  </button>
                </>
              )}
              <button
                className={`${styles.controlButton} ${
                  summaryState === "recording" ? styles.summaryActive : ""
                }`}
                type="button"
                onClick={requestSummary}
                disabled={
                  call.status !== "active" || summaryState !== "idle"
                }
                aria-label="Request an AI call summary"
              >
                <SummaryIcon />
                <span>
                  {summaryState === "requested"
                    ? "Waiting"
                    : summaryState === "starting"
                      ? "Starting"
                    : summaryState === "recording"
                      ? "Summary on"
                      : summaryState === "declined"
                        ? "Not allowed"
                        : "Summarize"}
                </span>
              </button>
              <button
                className={`${styles.controlButton} ${styles.endControl}`}
                type="button"
                onClick={endCall}
                aria-label="End call"
              >
                <PhoneIcon />
                <span>End</span>
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

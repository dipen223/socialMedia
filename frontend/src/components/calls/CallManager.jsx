import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSelector } from "react-redux";
import { getSocket } from "@/config/socket";
import { clientServer } from "@/config";
import { LANGUAGES, displayForDetectedLanguage } from "@/config/languages";
import {
  shouldSendInterim,
  shouldApplySegment,
  isFatalRecognitionError,
  recordAbort,
  isAbortLoop,
} from "@/config/liveTranslation";
import styles from "./CallManager.module.css";

const FALLBACK_ICE_SERVERS = [
  {
    urls:
      process.env.NEXT_PUBLIC_STUN_URL ||
      "stun:stun.l.google.com:19302",
  },
];

// Voice-activity detection tuning for speech chunking: a chunk ends when the
// speaker actually pauses, not on a fixed timer, so Whisper gets whole
// phrases instead of arbitrary fragments cut mid-word.
const VAD_SAMPLE_INTERVAL_MS = 100;
const VAD_SILENCE_STOP_MS = 600;
const VAD_MAX_CHUNK_MS = 7000;
const VAD_SPEAKING_RMS_THRESHOLD = 10;

const TranslateIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 5h7M7.5 3v2M6 5c.5 3 2.2 5.3 4.5 7M13 5c-.6 3.3-2.4 5.9-5 7.6" />
    <path d="M9.5 12.6 12 15M10 9.5c1.2.6 2.4 1.4 3.4 2.5M14 20l4-9 4 9M15.3 17h5.4" />
  </svg>
);

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

const NoteIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

const MinimizeIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 14h4a2 2 0 0 1 2 2v4M18 10h-4a2 2 0 0 1-2-2V4" />
  </svg>
);

export default function CallManager() {
  const [call, setCall] = useState(initialCall);
  const [minimized, setMinimized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [hasLocalMedia, setHasLocalMedia] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteIsSharing, setRemoteIsSharing] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [summaryState, setSummaryState] = useState("idle");
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [translation, setTranslation] = useState(null);
  const [peerLanguage, setPeerLanguage] = useState("en-US");
  const [translationBlockedReason, setTranslationBlockedReason] = useState(null);
  // How incoming translations are delivered: captions only, this browser's own
  // voice (instant, free), or the server's natural voice (slower, costs more).
  const [voiceMode, setVoiceMode] = useState("browser");
  // What the microphone side of translation is doing, shown in the call so a
  // failure is visible instead of silent.
  const [captureInfo, setCaptureInfo] = useState({ mode: "off", heard: "", error: "" });
  const [noteState, setNoteState] = useState("idle"); // idle | recording | saving | saved
  const profile = useSelector((state) => state.auth.user);
  const currentUser = profile?.userId || profile;
  const myLanguage = currentUser?.preferredLanguage || "en-US";
  const callRef = useRef(initialCall);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const translationAudioRef = useRef(null);
  const queuedCandidatesRef = useRef([]);
  const cameraTrackRef = useRef(null);
  const screenStreamRef = useRef(null);
  const summaryStateRef = useRef("idle");
  const summaryRecorderRef = useRef(null);
  const summaryChunksRef = useRef([]);
  const summaryAudioContextRef = useRef(null);
  const isSummaryRecorderRef = useRef(false);
  const iceServersRef = useRef(FALLBACK_ICE_SERVERS);
  const speechRecorderRef = useRef(null);
  const vadAudioContextRef = useRef(null);
  const vadIntervalRef = useRef(null);
  const vadHasSpeechRef = useRef(false);
  const vadSilenceStartRef = useRef(null);
  const vadChunkStartRef = useRef(0);
  const noteRecorderRef = useRef(null);
  const noteChunksRef = useRef([]);
  const noteSavedTimeoutRef = useRef(null);
  const translationEnabledRef = useRef(false);
  const voiceModeRef = useRef("browser");
  // True once a translation has actually arrived. Until then the peer's own
  // voice is left at full volume, so a translation that never comes (recognition
  // blocked, network, server error) can't leave the call silent.
  const translationLiveRef = useRef(false);
  const recognitionRef = useRef(null);
  const recognitionRestartRef = useRef(null);
  const abortTimesRef = useRef([]);
  const startRecognitionRef = useRef(null);
  const playNextAudioRef = useRef(null);
  const segmentStartRef = useRef(0);
  const interimRef = useRef({ text: "", sentAt: 0 });
  const shownSegmentRef = useRef(null);
  const audioQueueRef = useRef([]);
  const audioPlayingRef = useRef(false);
  const myLanguageRef = useRef(myLanguage);
  const peerLanguageRef = useRef("en-US");

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

  const stopVoiceActivityMonitor = useCallback(() => {
    if (vadIntervalRef.current) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    vadAudioContextRef.current?.close().catch(() => {});
    vadAudioContextRef.current = null;
  }, []);

  const stopBrowserRecognition = useCallback(() => {
    window.clearTimeout(recognitionRestartRef.current);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      // Already stopped.
    }
  }, []);

  const stopSpeechRecording = useCallback(() => {
    stopBrowserRecognition();
    if (
      speechRecorderRef.current &&
      speechRecorderRef.current.state !== "inactive"
    ) {
      try {
        speechRecorderRef.current.stop();
      } catch {
        // The recorder may already be stopped.
      }
    }
    speechRecorderRef.current = null;
    stopVoiceActivityMonitor();
  }, [stopBrowserRecognition, stopVoiceActivityMonitor]);

  // Feeds the local mic into an analyser once per translation session and
  // watches its volume every 100ms, rather than reacting to a fixed timer —
  // this is what lets a "chunk" mean one real spoken phrase instead of an
  // arbitrary 2.5s slice that may cut a sentence in half.
  const startVoiceActivityMonitor = useCallback(() => {
    if (vadIntervalRef.current || !localStreamRef.current) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    let audioContext;
    try {
      audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(localStreamRef.current);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.fftSize);
      vadAudioContextRef.current = audioContext;

      vadIntervalRef.current = window.setInterval(() => {
        if (!translationEnabledRef.current) return;
        analyser.getByteTimeDomainData(buffer);
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          const deviation = buffer[i] - 128;
          sumSquares += deviation * deviation;
        }
        const rms = Math.sqrt(sumSquares / buffer.length);
        const now = Date.now();

        if (rms > VAD_SPEAKING_RMS_THRESHOLD) {
          vadHasSpeechRef.current = true;
          vadSilenceStartRef.current = null;
        } else if (vadHasSpeechRef.current) {
          if (vadSilenceStartRef.current === null) {
            vadSilenceStartRef.current = now;
          } else if (now - vadSilenceStartRef.current >= VAD_SILENCE_STOP_MS) {
            const recorder = speechRecorderRef.current;
            if (recorder && recorder.state !== "inactive") recorder.stop();
            return;
          }
        }

        if (now - vadChunkStartRef.current >= VAD_MAX_CHUNK_MS) {
          const recorder = speechRecorderRef.current;
          if (recorder && recorder.state !== "inactive") recorder.stop();
        }
      }, VAD_SAMPLE_INTERVAL_MS);
    } catch {
      audioContext?.close().catch(() => {});
    }
  }, []);

  const startSpeechRecording = useCallback(() => {
    if (speechRecorderRef.current || !localStreamRef.current) return;
    if (typeof MediaRecorder === "undefined") return;
    const mimeType = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type));

    // Each chunk gets its own fresh recorder instead of one continuous
    // recorder sliced with start(2500) — only the FIRST slice of a
    // timesliced recording carries a valid container header, so every
    // slice after it fails Whisper's format check as a standalone file.
    // Stopping and starting a new recorder each cycle guarantees every
    // blob is a complete, independently-decodable audio file. The stop
    // itself is now triggered by the voice-activity monitor detecting a
    // pause (or the max-duration safety cap), not a fixed timer.
    const recordNextChunk = () => {
      if (!translationEnabledRef.current || !localStreamRef.current) {
        speechRecorderRef.current = null;
        return;
      }
      let recorder;
      try {
        recorder = new MediaRecorder(
          localStreamRef.current,
          mimeType ? { mimeType } : {}
        );
      } catch {
        recorder = new MediaRecorder(localStreamRef.current);
      }
      const chunks = [];
      vadHasSpeechRef.current = false;
      vadSilenceStartRef.current = null;
      vadChunkStartRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const callId = callRef.current.callId;
        if (
          chunks.length &&
          vadHasSpeechRef.current &&
          translationEnabledRef.current &&
          callId &&
          callRef.current.status === "active"
        ) {
          const blob = new Blob(chunks, {
            type: recorder.mimeType || mimeType || "audio/webm",
          });
          const durationMs = Date.now() - vadChunkStartRef.current;
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = String(reader.result).split(",")[1];
            if (!base64) return;
            getSocket()?.emit("call:translate-speech", {
              callId,
              audio: base64,
              mimeType: recorder.mimeType || mimeType || "audio/webm",
              targetLang: peerLanguageRef.current,
              durationMs,
            });
          };
          reader.readAsDataURL(blob);
        }
        recordNextChunk();
      };
      speechRecorderRef.current = recorder;
      try {
        recorder.start();
      } catch {
        speechRecorderRef.current = null;
        return;
      }
      // Fallback safety net in case the voice-activity monitor never
      // initialized (no AudioContext support) — without it a chunk could
      // otherwise run forever.
      window.setTimeout(() => {
        if (!vadIntervalRef.current && recorder.state !== "inactive") {
          recorder.stop();
        }
      }, VAD_MAX_CHUNK_MS);
    };

    recordNextChunk();
    startVoiceActivityMonitor();
  }, [startVoiceActivityMonitor]);

  // The fast path: the browser's own speech recognition turns speech into text
  // as it happens (no upload, no server transcription), so only the text needs
  // translating. Partial phrases go out as the speaker talks to keep the
  // listener's caption moving; a final goes out when the phrase ends. Returns
  // false when the browser can't do it, so the caller can use the recorder path.
  const startBrowserRecognition = useCallback(() => {
    if (recognitionRef.current) return true;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return false;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = myLanguageRef.current;

    const send = (text, final, segmentId, durationMs) => {
      const callId = callRef.current.callId;
      if (!callId || callRef.current.status !== "active") return;
      getSocket()?.emit("call:translate-text", {
        callId,
        text,
        final,
        segmentId,
        durationMs,
        targetLang: peerLanguageRef.current,
      });
    };

    recognition.onresult = (event) => {
      // Our own translated voice comes out of the speakers and back into the
      // mic - without this guard it would be transcribed and translated back
      // to the other person in an endless loop.
      const window_ = window.speechSynthesis;
      const audioElement = translationAudioRef.current;
      if (
        window_?.speaking ||
        audioPlayingRef.current ||
        (audioElement && !audioElement.paused)
      ) {
        return;
      }

      let partial = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = (result[0]?.transcript || "").trim();
        if (!text) continue;
        if (!segmentStartRef.current) segmentStartRef.current = Date.now();
        setCaptureInfo((info) => ({ ...info, heard: text, error: "" }));

        if (result.isFinal) {
          send(text, true, segmentStartRef.current, Date.now() - segmentStartRef.current);
          segmentStartRef.current = 0;
          interimRef.current = { text: "", sentAt: 0 };
        } else {
          partial = partial ? `${partial} ${text}` : text;
        }
      }

      const now = Date.now();
      if (
        partial &&
        shouldSendInterim({
          text: partial,
          lastText: interimRef.current.text,
          lastSentAt: interimRef.current.sentAt,
          now,
        })
      ) {
        interimRef.current = { text: partial, sentAt: now };
        send(partial, false, segmentStartRef.current, 0);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") {
        abortTimesRef.current = recordAbort(abortTimesRef.current, Date.now());
      }
      const abortLoop = isAbortLoop(abortTimesRef.current);
      if (!isFatalRecognitionError(event.error) && !abortLoop) {
        setCaptureInfo((info) => ({ ...info, error: event.error }));
        return;
      }
      abortTimesRef.current = [];
      // Recognition can't work here (blocked, offline service, unsupported
      // language) - switch to the server-side transcription path.
      stopBrowserRecognition();
      setCaptureInfo({ mode: "server", heard: "", error: event.error });
      if (translationEnabledRef.current) startSpeechRecording();
    };

    // Browsers end a recognition session after a stretch of silence or a
    // time limit - restart it for as long as translation is on.
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      if (!translationEnabledRef.current) return;
      recognitionRestartRef.current = window.setTimeout(() => {
        if (translationEnabledRef.current && !recognitionRef.current) {
          startRecognitionRef.current?.();
        }
      }, 150);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      return false;
    }
    setCaptureInfo((info) => ({ ...info, mode: "browser" }));
    return true;
  }, [startSpeechRecording, stopBrowserRecognition]);

  useEffect(() => {
    startRecognitionRef.current = startBrowserRecognition;
  }, [startBrowserRecognition]);

  const startTranslationCapture = useCallback(() => {
    if (startBrowserRecognition()) return;
    setCaptureInfo({ mode: "server", heard: "", error: "" });
    startSpeechRecording();
  }, [startBrowserRecognition, startSpeechRecording]);

  // The peer's own voice is never muted - once a translated voice is really
  // coming through it is turned down (like an interpreter's booth) so it can
  // still be heard underneath, and it is at full volume whenever there is no
  // translated voice to listen to.
  const applyRemoteAudioLevel = useCallback(() => {
    const ducked =
      translationEnabledRef.current &&
      voiceModeRef.current !== "captions" &&
      translationLiveRef.current;
    [remoteVideoRef.current, remoteAudioRef.current].forEach((element) => {
      if (!element) return;
      element.muted = false;
      element.volume = ducked ? 0.12 : 1;
    });
  }, []);

  // A single toggle drives translation for the whole call: turning it on
  // starts our own mic capture AND tells the peer's client to start theirs,
  // so both directions translate from one click — neither side has to
  // separately opt in for the other's speech to come through translated.
  const toggleTranslation = useCallback(
    (next) => {
      translationEnabledRef.current = next;
      setTranslationEnabled(next);
      if (next) {
        // Clear any earlier "blocked" notice - this is a fresh attempt, and the
        // backend will send call:translation-blocked again if it still applies.
        setTranslationBlockedReason(null);
        startTranslationCapture();
      } else {
        stopSpeechRecording();
        setTranslation(null);
        translationLiveRef.current = false;
        setCaptureInfo({ mode: "off", heard: "", error: "" });
        applyRemoteAudioLevel();
      }
    },
    [applyRemoteAudioLevel, startTranslationCapture, stopSpeechRecording]
  );

  const handleTranslationToggleClick = useCallback(() => {
    const next = !translationEnabledRef.current;
    toggleTranslation(next);
    const callId = callRef.current.callId;
    if (callId) {
      getSocket()?.emit("call:translation-toggle", { callId, enabled: next });
    }
  }, [toggleTranslation]);

  useEffect(() => {
    myLanguageRef.current = myLanguage;
  }, [myLanguage]);

  useEffect(() => {
    peerLanguageRef.current = peerLanguage;
  }, [peerLanguage]);

  // Tell the server how this listener wants translations delivered, so it only
  // generates the natural voice when someone will actually hear it.
  useEffect(() => {
    voiceModeRef.current = voiceMode;
    if (call.status === "active" && call.callId) {
      getSocket()?.emit("call:set-voice-mode", {
        callId: call.callId,
        mode: voiceMode,
      });
    }
    if (voiceMode !== "browser") window.speechSynthesis?.cancel();
    if (voiceMode === "captions") {
      audioQueueRef.current = [];
      translationAudioRef.current?.pause();
    }
  }, [voiceMode, call.status, call.callId]);

  useEffect(() => {
    if (call.status === "active" && call.callId) {
      getSocket()?.emit("call:set-language", {
        callId: call.callId,
        language: myLanguageRef.current,
      });
    }
  }, [call.status, call.callId]);

  const speakTranslation = useCallback((text, language) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    const synth = window.speechSynthesis;
    // Let the previous sentence finish rather than cutting it off - only drop
    // the backlog if the listener has fallen behind by more than one phrase.
    if (synth.pending) synth.cancel();
    const normalize = (lang) => lang.toLowerCase().replace("_", "-");
    const target = normalize(language);
    const voices = synth.getVoices();
    const voice =
      voices.find((item) => normalize(item.lang) === target) ||
      voices.find((item) =>
        normalize(item.lang).startsWith(target.split("-")[0])
      ) ||
      null;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice ? voice.lang : language;
    if (voice) utterance.voice = voice;
    utterance.rate = 1;
    utterance.pitch = 1;
    window.setTimeout(() => {
      synth.resume();
      synth.speak(utterance);
    }, 60);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return undefined;
    }
    const synth = window.speechSynthesis;
    synth.getVoices();
    const loadVoices = () => synth.getVoices();
    synth.addEventListener("voiceschanged", loadVoices);
    return () => synth.removeEventListener("voiceschanged", loadVoices);
  }, []);

  // Natural-voice clips play one after another; a new clip never cuts off the
  // one still playing.
  const playNextTranslationAudio = useCallback(() => {
    const element = translationAudioRef.current;
    if (!element) return;
    const next = audioQueueRef.current.shift();
    if (!next) {
      audioPlayingRef.current = false;
      return;
    }
    audioPlayingRef.current = true;
    element.onended = () => playNextAudioRef.current?.();
    element.onerror = () => playNextAudioRef.current?.();
    element.src = next;
    element.play().catch(() => {
      // If audio playback is blocked, the subtitle still shows the result.
      playNextAudioRef.current?.();
    });
  }, []);

  useEffect(() => {
    playNextAudioRef.current = playNextTranslationAudio;
  }, [playNextTranslationAudio]);

  const playTranslationAudio = useCallback(
    (url) => {
      // More than a couple queued means the listener is behind - drop the
      // oldest so playback catches up instead of lagging further.
      if (audioQueueRef.current.length >= 2) audioQueueRef.current.shift();
      audioQueueRef.current.push(url);
      if (!audioPlayingRef.current) playNextTranslationAudio();
    },
    [playNextTranslationAudio]
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
    setMinimized(false);
    setIsMuted(false);
    setIsCameraOff(false);
    setCallSeconds(0);
    updateSummaryState("idle");
    isSummaryRecorderRef.current = false;
    translationEnabledRef.current = false;
    setTranslationEnabled(false);
    setTranslation(null);
    setTranslationBlockedReason(null);
    setPeerLanguage("en-US");
    peerLanguageRef.current = "en-US";
    window.speechSynthesis?.cancel();
    audioQueueRef.current = [];
    audioPlayingRef.current = false;
    translationLiveRef.current = false;
    setCaptureInfo({ mode: "off", heard: "", error: "" });
    shownSegmentRef.current = null;
    segmentStartRef.current = 0;
    if (translationAudioRef.current) {
      translationAudioRef.current.pause();
      translationAudioRef.current.removeAttribute("src");
    }
    stopSpeechRecording();
    noteRecorderRef.current?.stop();
    clearTimeout(noteSavedTimeoutRef.current);
    setNoteState("idle");
    updateCall(initialCall);
  }, [stopMedia, stopSpeechRecording, updateCall, updateSummaryState]);

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
        applyRemoteAudioLevel();
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
    [applyRemoteAudioLevel, showEndedState, updateCall]
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
    applyRemoteAudioLevel();
  }, [call.status, call.mode, applyRemoteAudioLevel]);

  useEffect(() => {
    applyRemoteAudioLevel();
  }, [translationEnabled, voiceMode, applyRemoteAudioLevel]);

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
      const initialPeerLanguage = detail.peer?.preferredLanguage || "en-US";
      setPeerLanguage(initialPeerLanguage);
      peerLanguageRef.current = initialPeerLanguage;

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
      const initialPeerLanguage = incoming.caller?.preferredLanguage || "en-US";
      setPeerLanguage(initialPeerLanguage);
      peerLanguageRef.current = initialPeerLanguage;
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
    const handleTranslationResult = ({
      callId,
      originalText,
      translatedText,
      sourceLang,
      targetLang,
      speakerId,
      segmentId,
      final = true,
      audio,
    }) => {
      if (callRef.current.callId !== callId) return;
      const incoming = { speakerId, segmentId: segmentId ?? Date.now(), final };
      // A slow partial can land after the phrase it belongs to has finished.
      if (!shouldApplySegment(shownSegmentRef.current, incoming)) return;
      shownSegmentRef.current = incoming;
      if (final && !translationLiveRef.current) {
        translationLiveRef.current = true;
        applyRemoteAudioLevel();
      }

      setTranslation({
        originalText,
        translatedText,
        sourceLang,
        targetLang,
        speakerId,
        final,
      });
      // Only a finished phrase is spoken, and how depends on the listener's
      // choice: natural voice arrives separately, browser voice is immediate.
      if (!final || voiceModeRef.current === "captions") return;
      if (audio?.url) {
        playTranslationAudio(audio.url);
      } else if (voiceModeRef.current === "browser") {
        speakTranslation(translatedText, targetLang);
      }
    };
    // The server's natural voice follows the caption as its own event. If it
    // could not be generated it arrives without audio, and this browser's
    // voice reads the text instead.
    const handleTranslationAudio = ({ callId, translatedText, targetLang, audio }) => {
      if (callRef.current.callId !== callId) return;
      if (voiceModeRef.current !== "natural") return;
      if (audio?.url) {
        playTranslationAudio(audio.url);
      } else if (translatedText) {
        speakTranslation(translatedText, targetLang);
      }
    };
    const handlePeerLanguage = ({ callId, language }) => {
      if (callRef.current.callId !== callId || !language) return;
      peerLanguageRef.current = language;
      setPeerLanguage(language);
    };
    // Mirrors the peer's translate toggle onto our own client — this is what
    // makes one click turn on translation for both directions of the call.
    const handlePeerTranslationToggle = ({ callId, enabled }) => {
      if (callRef.current.callId !== callId) return;
      toggleTranslation(Boolean(enabled));
    };
    // Server-side gate: the backend only ever sends this when it refused to
    // process a chunk because of plan/usage, so switch translation back off
    // locally instead of leaving the mic recording chunks that will never work.
    const handleTranslationBlocked = ({ callId, reason }) => {
      if (callRef.current.callId !== callId) return;
      setTranslationBlockedReason(reason || "upgrade_required");
      toggleTranslation(false);
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
    socket.on("call:translation-result", handleTranslationResult);
    socket.on("call:translation-audio", handleTranslationAudio);
    socket.on("call:peer-language", handlePeerLanguage);
    socket.on("call:translation-toggle", handlePeerTranslationToggle);
    socket.on("call:translation-blocked", handleTranslationBlocked);

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
      socket.off("call:translation-result", handleTranslationResult);
      socket.off("call:translation-audio", handleTranslationAudio);
      socket.off("call:peer-language", handlePeerLanguage);
      socket.off("call:translation-toggle", handlePeerTranslationToggle);
      socket.off("call:translation-blocked", handleTranslationBlocked);
    };
  }, [
    acquireMedia,
    addQueuedCandidates,
    applyRemoteAudioLevel,
    createPeerConnection,
    loadIceServers,
    playTranslationAudio,
    resetCall,
    showEndedState,
    speakTranslation,
    toggleTranslation,
    startSummaryRecording,
    stopSummaryRecording,
    updateCall,
    updateSummaryState,
  ]);

  useEffect(() => () => stopSpeechRecording(), [stopSpeechRecording]);

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

  // A manual, self-only note capture - independent of the translation
  // pipeline above. It records only the local mic (localStreamRef.current),
  // never the peer's audio, and is only ever started by an explicit tap.
  const toggleNoteRecording = () => {
    if (noteState === "recording") {
      noteRecorderRef.current?.stop();
      return;
    }
    if (noteState !== "idle" || !localStreamRef.current) return;

    const mimeType = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    let recorder;
    try {
      recorder = new MediaRecorder(
        localStreamRef.current,
        mimeType ? { mimeType } : {}
      );
    } catch {
      recorder = new MediaRecorder(localStreamRef.current);
    }
    noteChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) noteChunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      noteRecorderRef.current = null;
      const blob = new Blob(noteChunksRef.current, {
        type: mimeType || "audio/webm",
      });
      if (!blob.size) {
        setNoteState("idle");
        return;
      }

      setNoteState("saving");
      try {
        const formData = new FormData();
        formData.append("audio", blob, "call-note.webm");
        if (callRef.current.conversationId) {
          formData.append("conversationId", callRef.current.conversationId);
        }
        if (callRef.current.callId) {
          formData.append("callId", callRef.current.callId);
        }
        try {
          formData.append(
            "timezone",
            Intl.DateTimeFormat().resolvedOptions().timeZone
          );
        } catch {
          // No-op: the note still saves without a timezone hint.
        }
        await clientServer.post("/notes/voice", formData);
        setNoteState("saved");
        noteSavedTimeoutRef.current = setTimeout(
          () => setNoteState("idle"),
          2500
        );
      } catch (error) {
        console.error("Could not save call note:", error.message);
        setNoteState("idle");
      }
    };

    noteRecorderRef.current = recorder;
    recorder.start();
    setNoteState("recording");
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
    <div
      className={`${styles.backdrop} ${
        minimized ? styles.backdropMinimized : ""
      }`}
      role="dialog"
      aria-modal={!minimized}
    >
      <section
        className={`${styles.callWindow} ${
          call.mode === "video" ? styles.videoCall : styles.audioCall
        } ${minimized ? styles.callWindowMinimized : ""}`}
      >
        {call.mode === "video" && (
          <div
            className={`${styles.videoStage} ${
              minimized ? styles.hiddenMedia : ""
            }`}
          >
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
        <audio ref={translationAudioRef} />

        {minimized ? (
          <div
            className={styles.minimizedBar}
            role="button"
            tabIndex={0}
            onClick={() => setMinimized(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                setMinimized(false);
              }
            }}
            aria-label="Return to call"
          >
            <span className={styles.callAvatar}>
              {hasPicture ? (
                <img src={call.peer.profilePicture} alt="" />
              ) : (
                initials(call.peer?.name)
              )}
            </span>
            <div className={styles.minimizedInfo}>
              <strong>{call.peer?.name || "SocialHub member"}</strong>
              <p>{call.status === "active" ? duration : statusText}</p>
            </div>
            <button
              type="button"
              className={styles.minimizedEnd}
              onClick={(event) => {
                event.stopPropagation();
                endCall();
              }}
              aria-label="End call"
            >
              <PhoneIcon />
            </button>
          </div>
        ) : (
          <>
            {call.status === "active" && (
              <button
                type="button"
                className={styles.minimizeTrigger}
                onClick={() => setMinimized(true)}
                aria-label="Minimize call and return to the app"
              >
                <MinimizeIcon />
              </button>
            )}

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
                <strong>{call.peer?.name || "SocialHub member"}</strong>
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
              {noteState === "recording" && (
                <span className={styles.recordingBadge}>
                  <i />
                  Taking a note...
                </span>
              )}
              {noteState === "saved" && (
                <span className={styles.recordingBadge}>Note saved</span>
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

            {translationEnabled && !translation && (
              <div className={styles.translationStatus}>
                <span className={styles.liveDot} />
                Live translation on
                {peerLanguage !== myLanguage && (
                  <>
                    {" "}
                    · {LANGUAGES[myLanguage]?.flag} → {LANGUAGES[peerLanguage]?.flag}
                  </>
                )}
              </div>
            )}

            {translation && (
              <div
                className={`${styles.translationBar} ${
                  translation.final === false ? styles.translationInterim : ""
                }`}
              >
                <span className={styles.translationLabel}>
                  {displayForDetectedLanguage(translation.sourceLang).flag}
                  {" → "}
                  {LANGUAGES[translation.targetLang]?.flag || "🌐"}
                </span>
                <p>{translation.translatedText}</p>
              </div>
            )}

            {translationEnabled && (
              <div className={styles.captureStatus} role="status">
                {captureInfo.mode === "browser" && "Mic: browser speech recognition"}
                {captureInfo.mode === "server" && "Mic: server transcription"}
                {captureInfo.error && ` · problem: ${captureInfo.error}`}
                {captureInfo.heard && ` · heard: “${captureInfo.heard}”`}
              </div>
            )}

            {translationEnabled && (
              <div className={styles.voiceModeRow} role="group" aria-label="How to hear translations">
                {[
                  ["captions", "Captions"],
                  ["browser", "Voice"],
                  ["natural", "Natural voice"],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={voiceMode === mode ? styles.voiceModeActive : styles.voiceModeButton}
                    aria-pressed={voiceMode === mode}
                    onClick={() => setVoiceMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {translationBlockedReason && (
              <div className={styles.translationBar}>
                <p>
                  Live call translation is a paid feature.{" "}
                  <Link href="/dashboard/pricing" onClick={() => setTranslationBlockedReason(null)}>
                    View plans
                  </Link>
                </p>
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
                      noteState === "recording" ? styles.summaryActive : ""
                    }`}
                    type="button"
                    onClick={toggleNoteRecording}
                    disabled={
                      call.status !== "active" ||
                      !hasLocalMedia ||
                      noteState === "saving"
                    }
                    aria-label={
                      noteState === "recording" ? "Stop and save note" : "Take a note"
                    }
                  >
                    <NoteIcon />
                    <span>
                      {noteState === "recording"
                        ? "Stop"
                        : noteState === "saving"
                          ? "Saving..."
                          : "Note"}
                    </span>
                  </button>
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
                    className={`${styles.controlButton} ${
                      translationEnabled ? styles.translationActive : ""
                    }`}
                    type="button"
                    onClick={handleTranslationToggleClick}
                    disabled={call.status !== "active"}
                    aria-label="Toggle live translation"
                  >
                    <TranslateIcon />
                    <span>{translationEnabled ? "Translate on" : "Translate"}</span>
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
          </>
        )}
      </section>
    </div>
  );
}

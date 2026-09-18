import { useCallback, useEffect, useRef, useState } from "react";
import { clientServer } from "@/config";
import styles from "./NoteComposer.module.css";

const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const StopIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

const timezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
};

// Browser-native dictation (Chrome/Edge's SpeechRecognition) - no audio
// upload, no Whisper call. It only fills the textarea; saving still goes
// through the normal typed-note path, so a dictated note costs nothing beyond
// whatever AI enrichment a typed note would already trigger. Unsupported
// elsewhere (Firefox, most Safari) - startListening surfaces that as an error
// pointing at the device keyboard's own dictation button instead.
const getRecognitionCtor = () => {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

export default function NoteComposer({ onCreated }) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");

  const recognitionRef = useRef(null);
  // Content as it stood when dictation started - final results are appended
  // onto this, so live interim results (re-sent as speech is refined) can
  // overwrite the tail of the textarea instead of duplicating it.
  const baseTextRef = useRef("");

  const saveTypedNote = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    setError("");
    try {
      const res = await clientServer.post("/notes", {
        content: trimmed,
        timezone: timezone(),
      });
      setContent("");
      onCreated?.(res.data?.note);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save that note.");
    } finally {
      setSaving(false);
    }
  }, [content, saving, onCreated]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const startListening = useCallback(() => {
    if (listening) return;
    const RecognitionCtor = getRecognitionCtor();
    if (!RecognitionCtor) {
      setError("Voice dictation needs Chrome or Edge - your device keyboard's own dictation button still works right in the textarea above.");
      return;
    }
    setError("");

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";

    baseTextRef.current = content.trim() ? `${content.trim()} ` : "";

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }
      if (finalText) {
        baseTextRef.current = `${baseTextRef.current}${finalText.trim()} `;
      }
      setContent(`${baseTextRef.current}${interimText}`.trimStart());
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError("Microphone access is needed to dictate a note.");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        setError("Dictation had a problem. You can keep typing instead.");
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [content, listening]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return (
    <div className={styles.composer}>
      <textarea
        className={styles.textarea}
        placeholder={listening ? "Listening..." : "Type a note, or dictate one with the mic..."}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={3}
      />
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.micButton} ${listening ? styles.recording : ""}`}
          onClick={listening ? stopListening : startListening}
          aria-pressed={listening}
          aria-label={listening ? "Stop dictating" : "Dictate a note"}
        >
          {listening ? <StopIcon /> : <MicIcon />}
          {listening ? "Stop" : "Dictate"}
        </button>
        <button
          type="button"
          className={styles.saveButton}
          onClick={saveTypedNote}
          disabled={!content.trim() || saving}
        >
          {saving ? "Saving..." : "Save note"}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

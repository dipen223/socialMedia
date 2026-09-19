// Pure helpers for the live-translation caption flow (kept out of the call
// component so the ordering and throttling rules can be tested on their own).

const MIN_INTERIM_WORDS = 4;
const MIN_INTERIM_CJK_CHARS = 6;
const MIN_INTERIM_GAP_MS = 900;

// A partial (still-being-spoken) phrase is worth translating only once it has
// some substance, has changed, and enough time has passed since the last one -
// this is what gives the listener a live, evolving caption without sending a
// request for every recognizer tick.
export const shouldSendInterim = ({ text, lastText, lastSentAt, now }) => {
  const trimmed = (text || "").trim();
  if (!trimmed || trimmed === lastText) return false;
  if (now - lastSentAt < MIN_INTERIM_GAP_MS) return false;
  // Scripts written without spaces (Chinese, Japanese) have no word gaps, so
  // count characters for them instead.
  if (!/\s/.test(trimmed)) return trimmed.length >= MIN_INTERIM_CJK_CHARS;
  return trimmed.split(/\s+/).length >= MIN_INTERIM_WORDS;
};

// Results can arrive out of order (a slow partial finishing after its final).
// segmentId is the timestamp the segment started, so it only ever increases
// per speaker. Show a result unless it is older than what is on screen, or a
// partial for a segment that has already been finalised.
export const shouldApplySegment = (shown, incoming) => {
  if (!shown || shown.speakerId !== incoming.speakerId) return true;
  if (incoming.segmentId < shown.segmentId) return false;
  if (incoming.segmentId === shown.segmentId && shown.final && !incoming.final) {
    return false;
  }
  return true;
};

// Errors after which browser speech recognition cannot work on this device,
// so the call should fall back to server-side (Whisper) transcription.
export const isFatalRecognitionError = (error) =>
  ["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported", "network"].includes(error);

// Chrome only lets one speech-recognition session run at a time per browser,
// so two tabs (or two apps) each starting one keep cancelling each other -
// an endless "aborted" loop that produces no text. Several aborts in a short
// window means recognition is not going to work here.
const ABORT_WINDOW_MS = 6000;
const ABORTS_BEFORE_FALLBACK = 3;

export const recordAbort = (times, now) => {
  const recent = times.filter((time) => now - time < ABORT_WINDOW_MS);
  return [...recent, now];
};

export const isAbortLoop = (times) => times.length >= ABORTS_BEFORE_FALLBACK;

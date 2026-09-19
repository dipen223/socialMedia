import { randomUUID } from "node:crypto";
import Conversation from "../models/conversations.model.js";
import User from "../models/user.model.js";
import { createCallHistoryMessage } from "../services/message.service.js";
import {
    transcribeAudio,
    translateSpeechText,
    synthesizeSpeech,
    SUPPORTED_TRANSLATION_LANGUAGES,
} from "../services/ai.service.js";
import { PLAN_LIMITS_SECONDS, reportOverageUsage } from "../services/stripe.service.js";

const calls = new Map();
const RING_TIMEOUT_MS = 45000;
// Subscription paywall for live translation is PAUSED by default: every
// account can translate and nothing is reported to Stripe. Set
// ENFORCE_TRANSLATION_BILLING=true to turn the plan gate and overage billing
// back on.
const BILLING_ENFORCED = process.env.ENFORCE_TRANSLATION_BILLING === "true";
// A chunk's self-reported duration is trusted for usage metering but clamped
// so a malicious client can't inflate/deflate it beyond one VAD chunk's worth.
const MAX_CHUNK_DURATION_MS = 15000;

// A silent-but-live 2.5s mic chunk still produces a full-size WebM blob, so
// this only catches literal empty/near-empty ones before spending an ASR call.
const MIN_AUDIO_BYTES = 2000;
// Bounds concurrent OpenAI calls per speaker if chunks back up faster than
// they're processed (slow network, degraded API) — load-shedding, not a queue.
const MAX_CONCURRENT_TRANSLATIONS_PER_SPEAKER = 2;
// Live captions: partial phrases are translated as the speaker talks so the
// listener sees text almost immediately. They're unmetered, so they're rate
// limited per speaker and capped in size.
const MAX_TEXT_CHARS = 600;
const INTERIM_MIN_GAP_MS = 700;
const VOICE_MODES = new Set(["captions", "browser", "natural"]);
// Whisper commonly hallucinates one of these short phrases on silence/noise.
const SILENCE_ARTIFACTS = new Set(["you", "thank you", "thank you.", "thanks for watching", "..."]);

const isMeaningfulTranscript = (text) => {
    const trimmed = (text || "").trim();
    if (trimmed.length < 2) return false;
    return !SILENCE_ARTIFACTS.has(trimmed.toLowerCase());
};

const emitToCallPeer = (io, socket, call, event, payload) => {
    const targetSocketId =
        socket.id === call.callerSocketId
            ? call.calleeSocketId
            : call.callerSocketId;
    if (targetSocketId) io.to(targetSocketId).emit(event, payload);
};

const closeCall = async (io, callId, reason, endedBy) => {
    const call = calls.get(callId);
    if (!call) return;
    clearTimeout(call.timeoutId);
    calls.delete(callId);

    const status =
        reason === "missed"
            ? "missed"
            : reason === "declined"
              ? "declined"
              : call.status === "active"
                ? "completed"
                : "cancelled";
    const durationSeconds =
        status === "completed" && call.acceptedAt
            ? (Date.now() - call.acceptedAt.getTime()) / 1000
            : 0;

    let historyMessageId = null;
    try {
        const result = await createCallHistoryMessage({
            conversationId: call.conversationId,
            callerId: call.callerId,
            calleeId: call.calleeId,
            mode: call.mode,
            status,
            durationSeconds,
            callId,
            summaryConsent:
                status === "completed" &&
                call.summaryConsent?.status === "approved"
                    ? call.summaryConsent
                    : null,
        });
        historyMessageId = result.message._id.toString();
        result.memberIds.forEach((memberId) => {
            io.to(`user:${memberId}`).emit("message:new", {
                message: result.message,
                conversation: result.conversation,
            });
        });
    } catch (error) {
        console.error("Could not save call history:", error.message);
    }

    [call.callerSocketId, call.calleeSocketId]
        .filter(Boolean)
        .forEach((socketId) => {
            io.to(socketId).emit("call:ended", {
                callId,
                reason,
                endedBy,
                historyMessageId,
            });
        });
};

// Plan/usage is looked up once per speaker per call and cached on the call
// object - cheap enough for a call's lifetime, and avoids a DB round trip on
// every 2.5-7s chunk. A mid-call upgrade won't unblock the caller until their
// next call; acceptable for this feature's scale.
const getSpeakerBilling = async (call, userId) => {
    if (call.billing[userId]) return call.billing[userId];

    const user = await User.findById(userId)
        .select("plan translationSecondsUsed translationOverageMinutesReported stripeCustomerId")
        .lean();
    const plan = user?.plan || "free";
    const billing = {
        plan,
        limitSeconds: PLAN_LIMITS_SECONDS[plan] ?? 0,
        secondsUsed: user?.translationSecondsUsed || 0,
        overageMinutesReported: user?.translationOverageMinutesReported || 0,
        stripeCustomerId: user?.stripeCustomerId || null,
    };
    call.billing[userId] = billing;
    return billing;
};

const peerUserIdOf = (call, speakerId) =>
    speakerId === call.callerId ? call.calleeId : call.callerId;

const wantsNaturalVoice = (call, speakerId) =>
    call.voiceModes[peerUserIdOf(call, speakerId)] === "natural";

// The natural (server-generated) voice is slow relative to the caption, so it
// is sent as its own event after the text has already been shown. If it fails
// the event still goes out without audio, and the listener's browser voice
// reads the text instead.
const sendNaturalVoice = async ({ io, socket, call, speakerId, translatedText, targetLang, segmentId }) => {
    const startedAt = Date.now();
    let audio;
    try {
        const speechBuffer = await synthesizeSpeech({
            text: translatedText,
            language: targetLang,
            voiceGender: call.voiceGenders?.[speakerId],
        });
        audio = { url: `data:audio/mpeg;base64,${speechBuffer.toString("base64")}` };
    } catch (ttsError) {
        console.error(`Translation TTS failed for call ${call.callId}:`, ttsError.message);
    }
    if (!calls.has(call.callId)) return Date.now() - startedAt;

    emitToCallPeer(io, socket, call, "call:translation-audio", {
        callId: call.callId,
        segmentId,
        speakerId,
        translatedText,
        targetLang,
        audio,
    });
    return Date.now() - startedAt;
};

// Translate a piece of already-transcribed text (from the speaker's browser
// speech recognition) and send the caption straight back. Partial phrases
// (isFinal false) only update the on-screen caption; only finals may trigger
// a spoken voice.
const processTranslationText = async ({
    io, socket, call, speakerId, text, targetLang, segmentId, isFinal,
}) => {
    const startedAt = Date.now();
    try {
        const translatedText = await translateSpeechText({ text, targetLang });
        if (!translatedText || !calls.has(call.callId)) return;
        const mtMs = Date.now() - startedAt;

        emitToCallPeer(io, socket, call, "call:translation-result", {
            callId: call.callId,
            originalText: text,
            translatedText,
            sourceLang: call.languages[speakerId]?.split("-")[0],
            targetLang,
            speakerId,
            segmentId,
            final: isFinal,
        });

        let ttsMs = 0;
        if (isFinal && wantsNaturalVoice(call, speakerId)) {
            ttsMs = await sendNaturalVoice({ io, socket, call, speakerId, translatedText, targetLang, segmentId });
        }
        if (isFinal) {
            console.log(`[translate:text] call=${call.callId} caption=${mtMs}ms tts=${ttsMs}ms`);
        }
    } catch (error) {
        console.error(`Text translation failed for call ${call.callId}:`, error.message);
    }
};

// Fallback path for browsers without speech recognition (or where it fails):
// the client uploads the recorded phrase and the server transcribes it. The
// caption goes out as soon as it's translated - the voice, if wanted, follows.
const processTranslationChunk = async ({
    io, socket, call, speakerId, audioBase64, mimeType, targetLang,
}) => {
    try {
        const startedAt = Date.now();
        const buffer = Buffer.from(audioBase64, "base64");
        if (buffer.length < MIN_AUDIO_BYTES) return;

        const { text: originalText, language: detectedLang } = await transcribeAudio({ buffer, mimeType });
        if (!isMeaningfulTranscript(originalText) || !calls.has(call.callId)) return;
        const sttMs = Date.now() - startedAt;

        // The speaker is already talking in the language the listener wants
        // to hear - nothing to translate, so skip the MT/TTS calls entirely.
        if (detectedLang && detectedLang === targetLang.split("-")[0]) return;

        const translatedText = await translateSpeechText({ text: originalText, targetLang });
        if (!translatedText || !calls.has(call.callId)) return;
        const captionMs = Date.now() - startedAt;

        const segmentId = Date.now();
        emitToCallPeer(io, socket, call, "call:translation-result", {
            callId: call.callId,
            originalText,
            translatedText,
            sourceLang: detectedLang,
            targetLang,
            speakerId,
            segmentId,
            final: true,
        });

        let ttsMs = 0;
        if (wantsNaturalVoice(call, speakerId)) {
            ttsMs = await sendNaturalVoice({ io, socket, call, speakerId, translatedText, targetLang, segmentId });
        }
        console.log(`[translate:audio] call=${call.callId} stt=${sttMs}ms caption=${captionMs}ms tts=${ttsMs}ms`);
    } catch (error) {
        console.error(`Translation pipeline failed for call ${call.callId}:`, error.message);
    }
};

// Shared gate for both translation paths: plan check, load-shedding, and (for
// finals) usage metering. Returns a release function when the work is
// admitted, or null when it should be dropped.
const admitTranslation = async ({ socket, call, speakerId, durationMs, interim = false }) => {
    let speakerBilling;
    try {
        speakerBilling = await getSpeakerBilling(call, speakerId);
    } catch (error) {
        console.error(`Could not load billing state for ${speakerId}:`, error.message);
        return null;
    }
    if (!calls.has(call.callId)) return null;

    // Free has no translation access at all - Plus never gets hard-blocked,
    // minutes past its 200/month included allowance just bill automatically
    // as overage (see below) instead of cutting a call off mid-sentence.
    if (BILLING_ENFORCED && speakerBilling.limitSeconds === 0) {
        socket.emit("call:translation-blocked", { callId: call.callId, reason: "upgrade_required" });
        return null;
    }

    if (interim) {
        const now = Date.now();
        if (
            call.pendingInterims[speakerId] ||
            now - (call.lastInterimAt[speakerId] || 0) < INTERIM_MIN_GAP_MS
        ) {
            return null;
        }
        call.lastInterimAt[speakerId] = now;
        call.pendingInterims[speakerId] = 1;
        return () => {
            call.pendingInterims[speakerId] = 0;
        };
    }

    const inFlight = call.pendingTranslations[speakerId] || 0;
    if (inFlight >= MAX_CONCURRENT_TRANSLATIONS_PER_SPEAKER) return null;
    call.pendingTranslations[speakerId] = inFlight + 1;

    // Charged on acceptance, not on a successful translation - a chunk still
    // costs an ASR call (and often MT/TTS too) even when it turns out to be
    // silence or gets skipped, so usage should reflect what was attempted.
    const chunkSeconds =
        Math.min(Math.max(Number(durationMs) || 0, 0), MAX_CHUNK_DURATION_MS) / 1000;
    speakerBilling.secondsUsed += chunkSeconds;
    User.updateOne({ _id: speakerId }, { $inc: { translationSecondsUsed: chunkSeconds } }).catch(
        (error) => console.error(`Could not record translation usage for ${speakerId}:`, error.message)
    );

    // Only the whole overage minutes newly crossed by THIS chunk get
    // reported - never re-reporting what's already been sent to Stripe's
    // meter is what keeps a chunk from ever being billed twice.
    const overageMinutesTotal = Math.floor(
        Math.max(0, speakerBilling.secondsUsed - speakerBilling.limitSeconds) / 60
    );
    const newOverageMinutes = overageMinutesTotal - speakerBilling.overageMinutesReported;
    if (BILLING_ENFORCED && newOverageMinutes > 0 && speakerBilling.stripeCustomerId) {
        speakerBilling.overageMinutesReported = overageMinutesTotal;
        reportOverageUsage({
            customerId: speakerBilling.stripeCustomerId,
            minutes: newOverageMinutes,
        })
            .then(() =>
                User.updateOne(
                    { _id: speakerId },
                    { $set: { translationOverageMinutesReported: overageMinutesTotal } }
                )
            )
            .catch((error) =>
                console.error(`Could not report translation overage for ${speakerId}:`, error.message)
            );
    }

    return () => {
        call.pendingTranslations[speakerId] = Math.max(0, (call.pendingTranslations[speakerId] || 1) - 1);
    };
};

const registerCallHandlers = ({ io, socket }) => {
    socket.on("call:invite", async (payload = {}, acknowledgement) => {
        const acknowledge =
            typeof acknowledgement === "function" ? acknowledgement : () => {};
        const mode = payload.mode === "video" ? "video" : "audio";
        const currentUserId = socket.user.id.toString();
        const targetUserId = payload.targetUserId?.toString();

        try {
            const conversation = await Conversation.findOne({
                _id: payload.conversationId,
                type: "direct",
                members: { $all: [currentUserId, targetUserId] },
            })
                .populate("members", "name username profilePicture preferredLanguage voiceGender")
                .lean();

            if (!conversation || targetUserId === currentUserId) {
                acknowledge({
                    ok: false,
                    message: "This call is not allowed.",
                });
                return;
            }

            const targetRoom = `user:${targetUserId}`;
            if (!io.sockets.adapter.rooms.get(targetRoom)?.size) {
                acknowledge({
                    ok: false,
                    message: "This person is offline.",
                });
                return;
            }

            const caller = conversation.members.find(
                (member) => member._id.toString() === currentUserId
            );
            // Captured once at call setup, from each member's own profile - the
            // synthesized voice that stands in for a speaker should match how
            // they set their own gender, not something guessed per-chunk.
            const voiceGenders = {};
            conversation.members.forEach((member) => {
                voiceGenders[member._id.toString()] = member.voiceGender === "male" ? "male" : "female";
            });
            const callId = randomUUID();
            const call = {
                callId,
                conversationId: conversation._id.toString(),
                callerId: currentUserId,
                calleeId: targetUserId,
                callerSocketId: socket.id,
                calleeSocketId: null,
                mode,
                status: "ringing",
                timeoutId: null,
                summaryConsent: null,
                languages: {},
                pendingTranslations: {},
                pendingInterims: {},
                lastInterimAt: {},
                voiceModes: {},
                billing: {},
                voiceGenders,
            };
            call.timeoutId = setTimeout(() => {
                closeCall(io, callId, "missed", null);
            }, RING_TIMEOUT_MS);
            calls.set(callId, call);

            acknowledge({ ok: true, callId });
            io.to(targetRoom).emit("call:incoming", {
                callId,
                conversationId: call.conversationId,
                mode,
                caller,
            });
        } catch (error) {
            console.error("Call invitation failed:", error.message);
            acknowledge({ ok: false, message: "Could not start the call." });
        }
    });

    socket.on("call:accept", (payload = {}, acknowledgement) => {
        const acknowledge =
            typeof acknowledgement === "function" ? acknowledgement : () => {};
        const call = calls.get(payload.callId);
        if (
            !call ||
            call.status !== "ringing" ||
            call.calleeId !== socket.user.id.toString()
        ) {
            acknowledge({ ok: false, message: "This call is no longer available." });
            return;
        }

        clearTimeout(call.timeoutId);
        call.status = "connecting";
        call.acceptedAt = new Date();
        call.calleeSocketId = socket.id;
        socket.to(`user:${call.calleeId}`).emit("call:taken", {
            callId: call.callId,
        });
        io.to(call.callerSocketId).emit("call:accepted", {
            callId: call.callId,
        });
        acknowledge({ ok: true });
    });

    socket.on("call:reject", (payload = {}) => {
        const call = calls.get(payload.callId);
        if (call?.calleeId !== socket.user.id.toString()) return;
        closeCall(io, call.callId, "declined", socket.user.id.toString());
    });

    socket.on("call:offer", (payload = {}) => {
        const call = calls.get(payload.callId);
        if (call?.callerSocketId !== socket.id || !call.calleeSocketId) return;
        io.to(call.calleeSocketId).emit("call:offer", {
            callId: call.callId,
            description: payload.description,
        });
    });

    socket.on("call:answer", (payload = {}) => {
        const call = calls.get(payload.callId);
        if (call?.calleeSocketId !== socket.id) return;
        call.status = "active";
        io.to(call.callerSocketId).emit("call:answer", {
            callId: call.callId,
            description: payload.description,
        });
    });

    socket.on("call:ice-candidate", (payload = {}) => {
        const call = calls.get(payload.callId);
        if (
            !call ||
            ![call.callerSocketId, call.calleeSocketId].includes(socket.id)
        ) {
            return;
        }
        emitToCallPeer(io, socket, call, "call:ice-candidate", {
            callId: call.callId,
            candidate: payload.candidate,
        });
    });

    socket.on("call:screen-share", (payload = {}) => {
        const call = calls.get(payload.callId);
        if (
            !call ||
            call.mode !== "video" ||
            ![call.callerSocketId, call.calleeSocketId].includes(socket.id)
        ) {
            return;
        }
        emitToCallPeer(io, socket, call, "call:screen-share", {
            callId: call.callId,
            active: Boolean(payload.active),
        });
    });

    socket.on("call:set-language", (payload = {}) => {
        const call = calls.get(payload.callId);
        if (!call || ![call.callerSocketId, call.calleeSocketId].includes(socket.id)) {
            return;
        }
        const language = SUPPORTED_TRANSLATION_LANGUAGES.has(payload.language)
            ? payload.language
            : null;
        if (!language) return;

        call.languages[socket.user.id.toString()] = language;
        emitToCallPeer(io, socket, call, "call:peer-language", {
            callId: call.callId,
            language,
        });
    });

    // A single click enables translation for the whole call: relay the
    // toggle to the peer so their client starts/stops its own mic capture
    // too, instead of requiring both participants to opt in separately.
    socket.on("call:translation-toggle", (payload = {}) => {
        const call = calls.get(payload.callId);
        if (!call || ![call.callerSocketId, call.calleeSocketId].includes(socket.id)) {
            return;
        }
        emitToCallPeer(io, socket, call, "call:translation-toggle", {
            callId: call.callId,
            enabled: Boolean(payload.enabled),
        });
    });

    socket.on("call:translate-speech", async (payload = {}) => {
        const call = calls.get(payload.callId);
        if (
            !call ||
            call.status !== "active" ||
            ![call.callerSocketId, call.calleeSocketId].includes(socket.id)
        ) {
            return;
        }

        const targetLang = SUPPORTED_TRANSLATION_LANGUAGES.has(payload.targetLang)
            ? payload.targetLang
            : null;
        const audioBase64 = typeof payload.audio === "string" ? payload.audio : null;
        if (!targetLang || !audioBase64) return;

        const speakerId = socket.user.id.toString();
        const release = await admitTranslation({
            socket,
            call,
            speakerId,
            durationMs: payload.durationMs,
        });
        if (!release) return;

        processTranslationChunk({
            io,
            socket,
            call,
            speakerId,
            audioBase64,
            mimeType: typeof payload.mimeType === "string" ? payload.mimeType : "audio/webm",
            targetLang,
        }).finally(release);
    });

    // Fast path: the speaker's browser already turned speech into text, so
    // only the translation is left. Partial phrases (final: false) keep the
    // listener's caption moving while the speaker is still talking.
    socket.on("call:translate-text", async (payload = {}) => {
        const call = calls.get(payload.callId);
        if (
            !call ||
            call.status !== "active" ||
            ![call.callerSocketId, call.calleeSocketId].includes(socket.id)
        ) {
            return;
        }

        const targetLang = SUPPORTED_TRANSLATION_LANGUAGES.has(payload.targetLang)
            ? payload.targetLang
            : null;
        const text = typeof payload.text === "string" ? payload.text.trim().slice(0, MAX_TEXT_CHARS) : "";
        const segmentId = Number(payload.segmentId);
        const isFinal = payload.final !== false;
        // Only finished phrases are logged - partials arrive several a second.
        const drop = (reason) => {
            if (isFinal) console.log(`[translate:drop] call=${call.callId} reason=${reason}`);
        };
        if (!targetLang) return drop("unsupported target language");
        if (!isMeaningfulTranscript(text)) return drop("empty or silence-artifact text");
        if (!Number.isFinite(segmentId)) return drop("bad segment id");

        const speakerId = socket.user.id.toString();

        // Same language on both ends - nothing to translate.
        const speakerLang = call.languages[speakerId];
        if (speakerLang && speakerLang.split("-")[0] === targetLang.split("-")[0]) {
            return drop(`same language (${speakerLang} -> ${targetLang})`);
        }
        if (isFinal) console.log(`[translate:recv] call=${call.callId} ${speakerLang || "?"} -> ${targetLang} "${text.slice(0, 40)}"`);

        const release = await admitTranslation({
            socket,
            call,
            speakerId,
            durationMs: isFinal ? payload.durationMs : 0,
            interim: !isFinal,
        });
        if (!release) return drop("not admitted (plan, rate or concurrency limit)");

        processTranslationText({
            io, socket, call, speakerId, text, targetLang, segmentId, isFinal,
        }).finally(release);
    });

    // How the listener wants to hear translations: captions only, their own
    // browser's voice, or the server-generated natural voice. Only "natural"
    // costs the server anything, so it's the only mode it needs to know about.
    socket.on("call:set-voice-mode", (payload = {}) => {
        const call = calls.get(payload.callId);
        if (!call || ![call.callerSocketId, call.calleeSocketId].includes(socket.id)) {
            return;
        }
        if (!VOICE_MODES.has(payload.mode)) return;
        call.voiceModes[socket.user.id.toString()] = payload.mode;
    });

    socket.on("call:summary-request", (payload = {}) => {
        const call = calls.get(payload.callId);
        if (
            !call ||
            call.status !== "active" ||
            ![call.callerSocketId, call.calleeSocketId].includes(socket.id) ||
            call.summaryConsent
        ) {
            return;
        }

        call.summaryConsent = {
            status: "requested",
            requestedBy: socket.user.id.toString(),
        };
        emitToCallPeer(io, socket, call, "call:summary-consent-request", {
            callId: call.callId,
        });
        socket.emit("call:summary-requested", { callId: call.callId });
    });

    socket.on("call:summary-consent", (payload = {}) => {
        const call = calls.get(payload.callId);
        if (
            !call ||
            call.status !== "active" ||
            call.summaryConsent?.status !== "requested" ||
            call.summaryConsent.requestedBy === socket.user.id.toString() ||
            ![call.callerSocketId, call.calleeSocketId].includes(socket.id)
        ) {
            return;
        }

        if (!payload.accepted) {
            call.summaryConsent = { ...call.summaryConsent, status: "declined" };
            [call.callerSocketId, call.calleeSocketId].forEach((socketId) => {
                io.to(socketId).emit("call:summary-declined", {
                    callId: call.callId,
                });
            });
            return;
        }

        call.summaryConsent = { ...call.summaryConsent, status: "approved" };
        io.to(call.callerSocketId).emit("call:summary-approved", {
            callId: call.callId,
            recorder: true,
        });
        io.to(call.calleeSocketId).emit("call:summary-approved", {
            callId: call.callId,
            recorder: false,
        });
    });

    socket.on("call:summary-cancel", (payload = {}) => {
        const call = calls.get(payload.callId);
        if (
            !call ||
            ![call.callerSocketId, call.calleeSocketId].includes(socket.id)
        ) {
            return;
        }
        call.summaryConsent = { status: "declined", requestedBy: null };
        [call.callerSocketId, call.calleeSocketId].forEach((socketId) => {
            io.to(socketId).emit("call:summary-declined", {
                callId: call.callId,
            });
        });
    });

    socket.on("call:end", (payload = {}) => {
        const call = calls.get(payload.callId);
        if (
            !call ||
            ![call.callerSocketId, call.calleeSocketId].includes(socket.id)
        ) {
            return;
        }
        closeCall(io, call.callId, "ended", socket.user.id.toString());
    });

    socket.on("disconnect", () => {
        for (const [callId, call] of calls) {
            if (
                call.callerSocketId === socket.id ||
                call.calleeSocketId === socket.id
            ) {
                closeCall(io, callId, "disconnected", socket.user.id.toString());
            }
        }
    });
};

export default registerCallHandlers;
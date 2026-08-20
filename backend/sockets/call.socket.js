import { randomUUID } from "node:crypto";
import Conversation from "../models/conversations.model.js";
import { createCallHistoryMessage } from "../services/message.service.js";
import {
    transcribeAudio,
    translateSpeechText,
    synthesizeSpeech,
    SUPPORTED_TRANSLATION_LANGUAGES,
} from "../services/ai.service.js";

const calls = new Map();
const RING_TIMEOUT_MS = 45000;

// A silent-but-live 2.5s mic chunk still produces a full-size WebM blob, so
// this only catches literal empty/near-empty ones before spending an ASR call.
const MIN_AUDIO_BYTES = 2000;
// Bounds concurrent OpenAI calls per speaker if chunks back up faster than
// they're processed (slow network, degraded API) — load-shedding, not a queue.
const MAX_CONCURRENT_TRANSLATIONS_PER_SPEAKER = 2;
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

const processTranslationChunk = async ({
    io, socket, call, speakerId, audioBase64, mimeType, targetLang,
}) => {
    try {
        const buffer = Buffer.from(audioBase64, "base64");
        if (buffer.length < MIN_AUDIO_BYTES) return;

        const { text: originalText, language: detectedLang } = await transcribeAudio({ buffer, mimeType });
        if (!isMeaningfulTranscript(originalText) || !calls.has(call.callId)) return;

        // The speaker is already talking in the language the listener wants
        // to hear — nothing to translate, so skip the MT/TTS calls entirely.
        if (detectedLang && detectedLang === targetLang.split("-")[0]) return;

        const translatedText = await translateSpeechText({ text: originalText, targetLang });
        if (!translatedText || !calls.has(call.callId)) return;

        let audioUrl;
        try {
            const speechBuffer = await synthesizeSpeech({ text: translatedText, language: targetLang });
            audioUrl = `data:audio/mpeg;base64,${speechBuffer.toString("base64")}`;
        } catch (ttsError) {
            // No audio.url -> frontend falls back to browser SpeechSynthesis.
            console.error(`Translation TTS failed for call ${call.callId}:`, ttsError.message);
        }
        if (!calls.has(call.callId)) return;

        emitToCallPeer(io, socket, call, "call:translation-result", {
            callId: call.callId,
            originalText,
            translatedText,
            sourceLang: detectedLang,
            targetLang,
            speakerId,
            audio: audioUrl ? { url: audioUrl } : undefined,
        });
    } catch (error) {
        console.error(`Translation pipeline failed for call ${call.callId}:`, error.message);
    }
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
                .populate("members", "name username profilePicture preferredLanguage")
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

    socket.on("call:translate-speech", (payload = {}) => {
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
        const inFlight = call.pendingTranslations[speakerId] || 0;
        if (inFlight >= MAX_CONCURRENT_TRANSLATIONS_PER_SPEAKER) return;
        call.pendingTranslations[speakerId] = inFlight + 1;

        processTranslationChunk({
            io,
            socket,
            call,
            speakerId,
            audioBase64,
            mimeType: typeof payload.mimeType === "string" ? payload.mimeType : "audio/webm",
            targetLang,
        }).finally(() => {
            call.pendingTranslations[speakerId] = Math.max(0, (call.pendingTranslations[speakerId] || 1) - 1);
        });
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
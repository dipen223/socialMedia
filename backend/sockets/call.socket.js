import { randomUUID } from "node:crypto";
import Conversation from "../models/conversations.model.js";
import { createCallHistoryMessage } from "../services/message.service.js";

const calls = new Map();
const RING_TIMEOUT_MS = 45000;

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
                .populate("members", "name username profilePicture")
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

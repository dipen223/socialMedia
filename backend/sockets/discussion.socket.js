import mongoose from "mongoose";
import DiscussionRoom from "../models/discussionRoom.model.js";
import User from "../models/user.model.js";
import { closePublisherSessions } from "../services/discussionMedia.service.js";
import DiscussionMessage from "../models/discussionMessage.model.js";

const rooms = new Map();

const publicParticipant = (participant) => ({
    userId: participant.userId,
    name: participant.name,
    username: participant.username,
    profilePicture: participant.profilePicture,
    role: participant.role,
    muted: participant.muted,
    requestedToSpeak: participant.requestedToSpeak,
});

const emitState = (io, roomId) => {
    const state = rooms.get(roomId);
    if (!state) return;
    io.to(`discussion:${roomId}`).emit("discussion:state", {
        roomId,
        participants: [...state.participants.values()].map(publicParticipant),
    });
};

const persistCount = async (roomId, count) => {
    try {
        await DiscussionRoom.updateOne(
            { _id: roomId, status: "live" },
            {
                $set: { participantCount: count },
                $max: { peakParticipantCount: count },
            }
        );
    } catch (error) {
        console.error("Could not update discussion count:", error.message);
    }
};

const leaveRoom = async (io, socket, roomId) => {
    const state = rooms.get(roomId);
    if (!state) return;
    const userId = socket.user.id.toString();
    const participant = state.participants.get(userId);
    if (!participant) return;

    participant.socketIds.delete(socket.id);
    socket.leave(`discussion:${roomId}`);
    socket.data.discussionRooms?.delete(roomId);
    if (participant.socketIds.size === 0) {
        state.participants.delete(userId);
        await closePublisherSessions(roomId, userId, io);
    }

    const count = state.participants.size;
    if (count === 0) rooms.delete(roomId);
    emitState(io, roomId);
    await persistCount(roomId, count);
};

const registerDiscussionHandlers = ({ io, socket }) => {
    socket.data.discussionRooms = new Set();

    socket.on("discussion:join", async (payload = {}, acknowledgement) => {
        const acknowledge = typeof acknowledgement === "function" ? acknowledgement : () => {};
        const roomId = payload.roomId?.toString();
        if (!mongoose.isValidObjectId(roomId)) {
            acknowledge({ ok: false, message: "Invalid discussion room." });
            return;
        }

        try {
            const [room, user] = await Promise.all([
                DiscussionRoom.findOne({ _id: roomId, status: "live" }).lean(),
                User.findById(socket.user.id).select("name username profilePicture").lean(),
            ]);
            if (!room || !user) {
                acknowledge({ ok: false, message: "This discussion has ended." });
                return;
            }

            let state = rooms.get(roomId);
            if (!state) {
                state = { participants: new Map() };
                rooms.set(roomId, state);
            }

            const userId = user._id.toString();
            const role =
                room.hostId.toString() === userId
                    ? "host"
                    : room.speakerIds.some((id) => id.toString() === userId)
                      ? "speaker"
                      : "listener";
            const existing = state.participants.get(userId);
            if (existing) {
                existing.socketIds.add(socket.id);
            } else {
                state.participants.set(userId, {
                    userId,
                    name: user.name,
                    username: user.username,
                    profilePicture: user.profilePicture,
                    role,
                    muted: true,
                    requestedToSpeak: false,
                    socketIds: new Set([socket.id]),
                });
            }

            socket.join(`discussion:${roomId}`);
            socket.data.discussionRooms.add(roomId);
            const count = state.participants.size;
            await persistCount(roomId, count);
            emitState(io, roomId);
            acknowledge({ ok: true, role });
        } catch (error) {
            console.error("Could not join discussion:", error.message);
            acknowledge({ ok: false, message: "Could not join the discussion." });
        }
    });

    socket.on("discussion:leave", (payload = {}) => {
        leaveRoom(io, socket, payload.roomId?.toString());
    });

    socket.on("discussion:request-speak", (payload = {}) => {
        const roomId = payload.roomId?.toString();
        const participant = rooms.get(roomId)?.participants.get(socket.user.id.toString());
        if (!participant || participant.role !== "listener") return;
        participant.requestedToSpeak = !participant.requestedToSpeak;
        emitState(io, roomId);
    });

    socket.on("discussion:speaker-decision", async (payload = {}, acknowledgement) => {
        const acknowledge = typeof acknowledgement === "function" ? acknowledgement : () => {};
        const roomId = payload.roomId?.toString();
        const room = await DiscussionRoom.findOne({
            _id: roomId,
            status: "live",
            hostId: socket.user.id,
        });
        const target = rooms.get(roomId)?.participants.get(payload.userId?.toString());
        if (!room || !target || target.role !== "listener") {
            acknowledge({ ok: false, message: "Request is no longer available." });
            return;
        }

        target.requestedToSpeak = false;
        if (payload.approved) {
            target.role = "speaker";
            target.muted = true;
            room.speakerIds.addToSet(target.userId);
            await room.save();
            target.socketIds.forEach((socketId) => {
                io.to(socketId).emit("discussion:promoted", { roomId });
            });
        }
        emitState(io, roomId);
        acknowledge({ ok: true });
    });

    socket.on("discussion:moderate", async (payload = {}) => {
        const roomId = payload.roomId?.toString();
        const room = await DiscussionRoom.findOne({
            _id: roomId,
            status: "live",
            hostId: socket.user.id,
        });
        const target = rooms.get(roomId)?.participants.get(payload.userId?.toString());
        if (!room || !target || target.role === "host") return;

        if (payload.action === "mute") {
            target.muted = true;
            await closePublisherSessions(roomId, target.userId, io);
            target.socketIds.forEach((id) => io.to(id).emit("discussion:force-mute", { roomId }));
        }
        if (payload.action === "move-to-audience") {
            target.role = "listener";
            target.muted = true;
            await closePublisherSessions(roomId, target.userId, io);
            room.speakerIds.pull(target.userId);
            await room.save();
        }
        if (payload.action === "remove") {
            await closePublisherSessions(roomId, target.userId, io);
            target.socketIds.forEach((id) => {
                io.to(id).emit("discussion:removed", { roomId });
                io.sockets.sockets.get(id)?.leave(`discussion:${roomId}`);
            });
            rooms.get(roomId)?.participants.delete(target.userId);
            await persistCount(roomId, rooms.get(roomId)?.participants.size || 0);
        }
        emitState(io, roomId);
    });

    socket.on("discussion:toggle-mute", (payload = {}) => {
        const roomId = payload.roomId?.toString();
        const participant = rooms.get(roomId)?.participants.get(socket.user.id.toString());
        if (!participant || participant.role === "listener") return;
        participant.muted = Boolean(payload.muted);
        emitState(io, roomId);
    });

    socket.on("discussion:message", async (payload = {}, acknowledgement) => {
        const acknowledge =
            typeof acknowledgement === "function" ? acknowledgement : () => {};
        const roomId = payload.roomId?.toString();
        const body = typeof payload.body === "string" ? payload.body.trim() : "";
        if (!mongoose.isValidObjectId(roomId) || !body || body.length > 1000) {
            acknowledge({ ok: false, message: "Message must be 1–1,000 characters." });
            return;
        }
        if (!socket.rooms.has(`discussion:${roomId}`)) {
            acknowledge({ ok: false, message: "Join the discussion before chatting." });
            return;
        }
        try {
            const room = await DiscussionRoom.exists({ _id: roomId, status: "live" });
            if (!room) {
                acknowledge({ ok: false, message: "This discussion has ended." });
                return;
            }
            const message = await DiscussionMessage.create({
                roomId,
                senderId: socket.user.id,
                body,
            });
            await message.populate("senderId", "name username profilePicture");
            io.to(`discussion:${roomId}`).emit("discussion:message:new", {
                message: message.toObject(),
            });
            acknowledge({ ok: true, messageId: message._id.toString() });
        } catch (error) {
            console.error("Could not send discussion message:", error.message);
            acknowledge({ ok: false, message: "Could not send the message." });
        }
    });

    socket.on("discussion:message:react", async (payload = {}, acknowledgement) => {
        const acknowledge =
            typeof acknowledgement === "function" ? acknowledgement : () => {};
        const roomId = payload.roomId?.toString();
        const messageId = payload.messageId?.toString();
        const emoji = typeof payload.emoji === "string" ? payload.emoji.trim() : "";
        if (
            !mongoose.isValidObjectId(roomId) ||
            !mongoose.isValidObjectId(messageId) ||
            !emoji ||
            emoji.length > 12 ||
            !socket.rooms.has(`discussion:${roomId}`)
        ) {
            acknowledge({ ok: false, message: "Invalid reaction." });
            return;
        }
        try {
            const message = await DiscussionMessage.findOne({
                _id: messageId,
                roomId,
                deletedAt: null,
            });
            if (!message) {
                acknowledge({ ok: false, message: "Message not found." });
                return;
            }
            const userId = socket.user.id.toString();
            const reaction = message.reactions.find((item) => item.emoji === emoji);
            if (reaction) {
                const hasReacted = reaction.userIds.some(
                    (id) => id.toString() === userId
                );
                if (hasReacted) reaction.userIds.pull(socket.user.id);
                else reaction.userIds.addToSet(socket.user.id);
                if (reaction.userIds.length === 0) {
                    message.reactions = message.reactions.filter(
                        (item) => item.emoji !== emoji
                    );
                }
            } else {
                message.reactions.push({ emoji, userIds: [socket.user.id] });
            }
            await message.save();
            io.to(`discussion:${roomId}`).emit("discussion:message:updated", {
                messageId,
                reactions: message.reactions,
            });
            acknowledge({ ok: true });
        } catch (error) {
            console.error("Could not react to discussion message:", error.message);
            acknowledge({ ok: false, message: "Could not update reaction." });
        }
    });

    socket.on("discussion:message:delete", async (payload = {}, acknowledgement) => {
        const acknowledge =
            typeof acknowledgement === "function" ? acknowledgement : () => {};
        const roomId = payload.roomId?.toString();
        const messageId = payload.messageId?.toString();
        if (
            !mongoose.isValidObjectId(roomId) ||
            !mongoose.isValidObjectId(messageId)
        ) {
            acknowledge({ ok: false, message: "Invalid message." });
            return;
        }
        try {
            const room = await DiscussionRoom.findById(roomId).select("hostId");
            const message = await DiscussionMessage.findOne({
                _id: messageId,
                roomId,
                deletedAt: null,
            });
            if (!room || !message) {
                acknowledge({ ok: false, message: "Message not found." });
                return;
            }
            const currentUserId = socket.user.id.toString();
            const allowed =
                room.hostId.toString() === currentUserId ||
                message.senderId.toString() === currentUserId;
            if (!allowed) {
                acknowledge({ ok: false, message: "You cannot remove this message." });
                return;
            }
            message.body = "Message removed";
            message.deletedAt = new Date();
            message.deletedBy = socket.user.id;
            message.reactions = [];
            await message.save();
            io.to(`discussion:${roomId}`).emit("discussion:message:deleted", {
                messageId,
                deletedAt: message.deletedAt,
            });
            acknowledge({ ok: true });
        } catch (error) {
            console.error("Could not delete discussion message:", error.message);
            acknowledge({ ok: false, message: "Could not remove the message." });
        }
    });

    socket.on("discussion:end", async (payload = {}, acknowledgement) => {
        const acknowledge = typeof acknowledgement === "function" ? acknowledgement : () => {};
        const roomId = payload.roomId?.toString();
        const room = await DiscussionRoom.findOneAndUpdate(
            { _id: roomId, status: "live", hostId: socket.user.id },
            { $set: { status: "ended", endedAt: new Date(), participantCount: 0 } },
            { new: true }
        );
        if (!room) {
            acknowledge({ ok: false, message: "You cannot end this discussion." });
            return;
        }
        io.to(`discussion:${roomId}`).emit("discussion:ended", { roomId });
        io.emit("discussion:closed", { roomId, postId: room.postId.toString() });
        rooms.delete(roomId);
        acknowledge({ ok: true });
    });

    socket.on("disconnect", () => {
        [...(socket.data.discussionRooms || [])].forEach((roomId) => {
            leaveRoom(io, socket, roomId);
        });
    });
};

export default registerDiscussionHandlers;

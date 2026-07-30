import mongoose from "mongoose";
import Conversation from "../models/conversations.model.js";

const onlineSocketsByUser = new Map();

const addOnlineSocket = (userId, socketId) => {
    const sockets = onlineSocketsByUser.get(userId) || new Set();
    sockets.add(socketId);
    onlineSocketsByUser.set(userId, sockets);
};

const removeOnlineSocket = (userId, socketId) => {
    const sockets = onlineSocketsByUser.get(userId);
    if (!sockets) return false;
    sockets.delete(socketId);
    if (sockets.size) return true;
    onlineSocketsByUser.delete(userId);
    return false;
};

const registerPresenceHandlers = ({ io, socket }) => {
    const currentUserId = socket.user.id.toString();
    addOnlineSocket(currentUserId, socket.id);
    io.to(`presence-watch:${currentUserId}`).emit("presence:update", {
        userId: currentUserId,
        isOnline: true,
    });

    socket.on("presence:subscribe", async (payload = {}, acknowledgement) => {
        const acknowledge =
            typeof acknowledgement === "function" ? acknowledgement : () => {};
        const requestedIds = Array.isArray(payload.userIds)
            ? [...new Set(payload.userIds.map(String))]
                  .filter((id) => mongoose.isValidObjectId(id))
                  .slice(0, 200)
            : [];

        try {
            const conversations = await Conversation.find({
                members: currentUserId,
            })
                .select("members")
                .lean();
            const allowedIds = new Set(
                conversations.flatMap((conversation) =>
                    conversation.members.map(String)
                )
            );
            allowedIds.delete(currentUserId);

            const subscribedIds = requestedIds.filter((id) => allowedIds.has(id));
            subscribedIds.forEach((userId) =>
                socket.join(`presence-watch:${userId}`)
            );

            acknowledge({
                ok: true,
                statuses: Object.fromEntries(
                    subscribedIds.map((userId) => [
                        userId,
                        onlineSocketsByUser.has(userId),
                    ])
                ),
            });
        } catch (error) {
            console.error("Presence subscription failed:", error.message);
            acknowledge({
                ok: false,
                message: "Could not retrieve presence.",
            });
        }
    });

    socket.on("disconnect", () => {
        const remainsOnline = removeOnlineSocket(currentUserId, socket.id);
        if (!remainsOnline) {
            io.to(`presence-watch:${currentUserId}`).emit("presence:update", {
                userId: currentUserId,
                isOnline: false,
            });
        }
    });
};

export default registerPresenceHandlers;

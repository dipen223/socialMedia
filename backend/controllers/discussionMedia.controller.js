import mongoose from "mongoose";
import DiscussionRoom from "../models/discussionRoom.model.js";
import {
    cloudflareRequest,
    findTrack,
    getOwnedSession,
    getRoomTracks,
    isConfigured,
    rememberSession,
    rememberTrack,
    removeSession,
} from "../services/discussionMedia.service.js";

const getLiveRoom = (roomId) => {
    if (!mongoose.isValidObjectId(roomId)) return null;
    return DiscussionRoom.findOne({ _id: roomId, status: "live" }).lean();
};

const canPublish = (room, userId) =>
    room.hostId.toString() === userId.toString() ||
    room.speakerIds.some((id) => id.toString() === userId.toString());

const createSession = async (req, res) => {
    if (!isConfigured()) {
        return res.status(503).json({ message: "Group audio is not configured." });
    }
    const room = await getLiveRoom(req.params.roomId);
    if (!room) return res.status(404).json({ message: "Discussion room not found." });

    const purpose = req.body?.purpose === "publish" ? "publish" : "subscribe";
    if (purpose === "publish" && !canPublish(room, req.user.id)) {
        return res.status(403).json({ message: "Only speakers can publish audio." });
    }

    try {
        const data = await cloudflareRequest("/sessions/new");
        rememberSession({
            sessionId: data.sessionId,
            roomId: room._id.toString(),
            userId: req.user.id.toString(),
            purpose,
        });
        return res.status(201).json({ sessionId: data.sessionId });
    } catch (error) {
        console.error("Could not create SFU session:", error.message);
        return res.status(error.statusCode || 502).json({ message: error.message });
    }
};

const publishTrack = async (req, res) => {
    const { roomId, sessionId } = req.params;
    const room = await getLiveRoom(roomId);
    const session = getOwnedSession(sessionId, req.user.id, roomId);
    if (!room || !session || session.purpose !== "publish") {
        return res.status(403).json({ message: "Invalid publishing session." });
    }
    if (!canPublish(room, req.user.id)) {
        return res.status(403).json({ message: "You are no longer a speaker." });
    }
    const description = req.body?.sessionDescription;
    if (!description?.sdp || description.type !== "offer") {
        return res.status(400).json({ message: "A valid WebRTC offer is required." });
    }

    const trackName = `room-${roomId}-user-${req.user.id}-audio`;
    try {
        const data = await cloudflareRequest(
            `/sessions/${sessionId}/tracks/new`,
            {
                body: {
                    sessionDescription: description,
                    tracks: [{
                        location: "local",
                        mid: req.body.mid,
                        trackName,
                    }],
                },
            }
        );
        const published = data.tracks?.find((track) => !track.errorCode);
        if (!published) throw new Error("Cloudflare did not accept the audio track.");

        const publicTrack = {
            roomId: room._id.toString(),
            userId: req.user.id.toString(),
            sessionId,
            trackName: published.trackName || trackName,
            mid: published.mid,
        };
        rememberTrack(publicTrack);
        req.app.get("io")?.to(`discussion:${roomId}`).emit(
            "discussion:media-track",
            publicTrack
        );
        return res.status(200).json({
            sessionDescription: data.sessionDescription,
            track: publicTrack,
        });
    } catch (error) {
        console.error("Could not publish SFU track:", error.message);
        return res.status(error.statusCode || 502).json({ message: error.message });
    }
};

const subscribeTrack = async (req, res) => {
    const { roomId, sessionId } = req.params;
    const room = await getLiveRoom(roomId);
    const session = getOwnedSession(sessionId, req.user.id, roomId);
    const source = findTrack(
        req.body?.sourceSessionId,
        req.body?.trackName,
        roomId
    );
    if (!room || !session || session.purpose !== "subscribe" || !source) {
        return res.status(403).json({ message: "Invalid audio subscription." });
    }

    try {
        const data = await cloudflareRequest(
            `/sessions/${sessionId}/tracks/new`,
            {
                body: {
                    tracks: [{
                        location: "remote",
                        sessionId: source.sessionId,
                        trackName: source.trackName,
                    }],
                },
            }
        );
        return res.status(200).json(data);
    } catch (error) {
        console.error("Could not subscribe to SFU track:", error.message);
        return res.status(error.statusCode || 502).json({ message: error.message });
    }
};

const renegotiate = async (req, res) => {
    const { roomId, sessionId } = req.params;
    const session = getOwnedSession(sessionId, req.user.id, roomId);
    if (!session || !req.body?.sessionDescription?.sdp) {
        return res.status(403).json({ message: "Invalid SFU session." });
    }
    try {
        const data = await cloudflareRequest(
            `/sessions/${sessionId}/renegotiate`,
            { method: "PUT", body: { sessionDescription: req.body.sessionDescription } }
        );
        return res.status(200).json(data);
    } catch (error) {
        console.error("Could not renegotiate SFU session:", error.message);
        return res.status(error.statusCode || 502).json({ message: error.message });
    }
};

const listTracks = async (req, res) => {
    const room = await getLiveRoom(req.params.roomId);
    if (!room) return res.status(404).json({ message: "Discussion room not found." });
    return res.status(200).json({ tracks: getRoomTracks(room._id.toString()) });
};

const closeSession = async (req, res) => {
    const { roomId, sessionId } = req.params;
    const session = getOwnedSession(sessionId, req.user.id, roomId);
    if (!session) return res.status(204).end();

    const tracks = getRoomTracks(roomId).filter(
        (track) => track.sessionId === sessionId
    );
    if (tracks.length) {
        try {
            await cloudflareRequest(`/sessions/${sessionId}/tracks/close`, {
                method: "PUT",
                body: {
                    tracks: tracks.map((track) => ({ mid: track.mid })),
                    force: true,
                },
            });
        } catch (error) {
            console.error("Could not close SFU tracks:", error.message);
        }
    }
    removeSession(sessionId);
    req.app.get("io")?.to(`discussion:${roomId}`).emit("discussion:media-closed", {
        sessionId,
    });
    return res.status(204).end();
};

export default {
    closeSession,
    createSession,
    listTracks,
    publishTrack,
    renegotiate,
    subscribeTrack,
};

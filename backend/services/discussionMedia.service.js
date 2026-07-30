const sessions = new Map();
const publishedTracks = new Map();

const apiBase = () =>
    `https://rtc.live.cloudflare.com/v1/apps/${process.env.CLOUDFLARE_REALTIME_APP_ID}`;

const isConfigured = () =>
    Boolean(
        process.env.CLOUDFLARE_REALTIME_APP_ID &&
        process.env.CLOUDFLARE_REALTIME_APP_SECRET
    );

const cloudflareRequest = async (path, { method = "POST", body } = {}) => {
    if (!isConfigured()) {
        const error = new Error("Cloudflare Realtime SFU is not configured.");
        error.statusCode = 503;
        throw error;
    }

    const response = await fetch(`${apiBase()}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${process.env.CLOUDFLARE_REALTIME_APP_SECRET}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.errorCode) {
        const error = new Error(
            data.errorDescription || data.message || "Cloudflare Realtime request failed."
        );
        error.statusCode = response.status || 502;
        throw error;
    }
    return data;
};

const rememberSession = ({ sessionId, roomId, userId, purpose }) => {
    sessions.set(sessionId, { sessionId, roomId, userId, purpose });
};

const getOwnedSession = (sessionId, userId, roomId) => {
    const session = sessions.get(sessionId);
    if (
        !session ||
        session.userId !== userId.toString() ||
        session.roomId !== roomId.toString()
    ) {
        return null;
    }
    return session;
};

const rememberTrack = (track) => {
    publishedTracks.set(`${track.sessionId}:${track.trackName}`, track);
};

const findTrack = (sessionId, trackName, roomId) => {
    const track = publishedTracks.get(`${sessionId}:${trackName}`);
    return track?.roomId === roomId.toString() ? track : null;
};

const getRoomTracks = (roomId) =>
    [...publishedTracks.values()].filter(
        (track) => track.roomId === roomId.toString()
    );

const removeSession = (sessionId) => {
    sessions.delete(sessionId);
    [...publishedTracks.entries()].forEach(([key, track]) => {
        if (track.sessionId === sessionId) publishedTracks.delete(key);
    });
};

const closePublisherSessions = async (roomId, userId, io) => {
    const matchingSessions = [...sessions.values()].filter(
        (session) =>
            session.roomId === roomId.toString() &&
            session.userId === userId.toString() &&
            session.purpose === "publish"
    );
    for (const session of matchingSessions) {
        const tracks = getRoomTracks(roomId).filter(
            (track) => track.sessionId === session.sessionId
        );
        if (tracks.length) {
            try {
                await cloudflareRequest(
                    `/sessions/${session.sessionId}/tracks/close`,
                    {
                        method: "PUT",
                        body: {
                            tracks: tracks.map((track) => ({ mid: track.mid })),
                            force: true,
                        },
                    }
                );
            } catch (error) {
                console.error("Could not force-close speaker audio:", error.message);
            }
        }
        removeSession(session.sessionId);
        io?.to(`discussion:${roomId}`).emit("discussion:media-closed", {
            sessionId: session.sessionId,
        });
    }
};

export {
    closePublisherSessions,
    cloudflareRequest,
    findTrack,
    getOwnedSession,
    getRoomTracks,
    isConfigured,
    rememberSession,
    rememberTrack,
    removeSession,
};

import express from "express";
import auth from "../middlewares/auth.js";
import discussionRoomController from "../controllers/discussionRoom.controller.js";
import discussionMediaController from "../controllers/discussionMedia.controller.js";

const discussionRoomRouter = express.Router();

discussionRoomRouter.post(
    "/posts/:postId/discussion-room",
    auth,
    discussionRoomController.startRoom
);
discussionRoomRouter.get(
    "/discussion-rooms/:roomId",
    auth,
    discussionRoomController.getRoom
);
discussionRoomRouter.get(
    "/discussion-rooms/:roomId/messages",
    auth,
    discussionRoomController.getMessages
);
discussionRoomRouter.get(
    "/discussion-rooms/:roomId/media/tracks",
    auth,
    discussionMediaController.listTracks
);
discussionRoomRouter.post(
    "/discussion-rooms/:roomId/media/sessions",
    auth,
    discussionMediaController.createSession
);
discussionRoomRouter.post(
    "/discussion-rooms/:roomId/media/sessions/:sessionId/publish",
    auth,
    discussionMediaController.publishTrack
);
discussionRoomRouter.post(
    "/discussion-rooms/:roomId/media/sessions/:sessionId/subscribe",
    auth,
    discussionMediaController.subscribeTrack
);
discussionRoomRouter.put(
    "/discussion-rooms/:roomId/media/sessions/:sessionId/renegotiate",
    auth,
    discussionMediaController.renegotiate
);
discussionRoomRouter.delete(
    "/discussion-rooms/:roomId/media/sessions/:sessionId",
    auth,
    discussionMediaController.closeSession
);

export default discussionRoomRouter;

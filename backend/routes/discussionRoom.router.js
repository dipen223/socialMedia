import express from "express";
import auth from "../middlewares/auth.js";
import discussionRoomController from "../controllers/discussionRoom.controller.js";

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

export default discussionRoomRouter;

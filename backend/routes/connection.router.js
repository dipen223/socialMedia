import express from "express";
import connectionController from "../controllers/connection.controller.js";
import auth from "../middlewares/auth.js";

const connectionRouter = express.Router();

connectionRouter.post(
    "/connection-requests",
    auth,
    connectionController.sendConnectionRequest
);

connectionRouter.get(
    "/connection-requests/sent",
    auth,
    connectionController.getSentRequests
);

connectionRouter.get(
    "/connection-requests/received",
    auth,
    connectionController.getReceivedRequests
);

connectionRouter.patch(
    "/connection-requests/:requestId/accept",
    auth,
    connectionController.acceptConnectionRequest
);

connectionRouter.delete(
    "/connection-requests/:requestId",
    auth,
    connectionController.deleteConnectionRequest
);

connectionRouter.get(
    "/connections",
    auth,
    connectionController.getMyConnections
);

export default connectionRouter;

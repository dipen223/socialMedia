import express from "express";
import notificationController from "../controllers/notification.controller.js";
import auth from "../middlewares/auth.js";

const notificationRouter = express.Router();

notificationRouter.get(
    "/notifications",
    auth,
    notificationController.getNotifications
);

notificationRouter.patch(
    "/notifications/read-all",
    auth,
    notificationController.markAllNotificationsRead
);

notificationRouter.patch(
    "/notifications/:notificationId/read",
    auth,
    notificationController.markNotificationRead
);

export default notificationRouter;

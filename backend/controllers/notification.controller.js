import mongoose from "mongoose";
import Notification from "../models/notification.model.js";

const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({
            recipientId: req.user.id
        })
            .populate("actorId", "name username profilePicture")
            .sort({ createdAt: -1 })
            .lean();

        const unreadCount = await Notification.countDocuments({
            recipientId: req.user.id,
            readAt: null
        });

        return res.status(200).json({ notifications, unreadCount });
    } catch (error) {
        console.error("Error fetching notifications:", error.message);
        return res.status(500).json({ message: "Could not retrieve notifications." });
    }
};

const markNotificationRead = async (req, res) => {
    const { notificationId } = req.params;

    if (!mongoose.isValidObjectId(notificationId)) {
        return res.status(400).json({ message: "Invalid notification." });
    }

    try {
        const notification = await Notification.findOneAndUpdate(
            {
                _id: notificationId,
                recipientId: req.user.id
            },
            {
                $set: { readAt: new Date() }
            },
            {
                new: true
            }
        ).populate("actorId", "name username profilePicture");

        if (!notification) {
            return res.status(404).json({ message: "Notification not found." });
        }

        return res.status(200).json({ notification });
    } catch (error) {
        console.error("Error marking notification as read:", error.message);
        return res.status(500).json({ message: "Could not update notification." });
    }
};

const markAllNotificationsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            {
                recipientId: req.user.id,
                readAt: null
            },
            {
                $set: { readAt: new Date() }
            }
        );

        return res.status(200).json({ message: "All notifications marked as read." });
    } catch (error) {
        console.error("Error marking notifications as read:", error.message);
        return res.status(500).json({ message: "Could not update notifications." });
    }
};

export default {
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead
};

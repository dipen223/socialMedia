import mongoose from "mongoose";
import Connection from "../models/connections.model.js";
import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";

const sendConnectionRequest = async (req, res) => {
    const requesterId = req.user.id;
    const { recipientId } = req.body;

    if (!recipientId) {
        return res.status(400).json({ message: "Recipient is required." });
    }

    if (!mongoose.isValidObjectId(recipientId)) {
        return res.status(400).json({ message: "Invalid recipient." });
    }

    if (requesterId.toString() === recipientId.toString()) {
        return res.status(400).json({ message: "You cannot connect with yourself." });
    }

    try {
        const recipient = await User.findById(recipientId);
        if (!recipient) {
            return res.status(404).json({ message: "User not found." });
        }

        const existingConnection = await Connection.findOne({
            $or: [
                { requesterId, recipientId },
                { requesterId: recipientId, recipientId: requesterId }
            ]
        });

        if (existingConnection?.status === "accepted") {
            return res.status(409).json({ message: "You are already connected." });
        }

        if (existingConnection) {
            return res.status(409).json({ message: "A connection request already exists." });
        }

        const request = await Connection.create({
            requesterId,
            recipientId,
            status: "pending"
        });

        await Notification.create({
            recipientId,
            actorId: requesterId,
            type: "connection_request",
            connectionId: request._id
        });

        return res.status(201).json({
            message: "Connection request sent.",
            request
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "A connection request already exists." });
        }

        console.error("Error sending connection request:", error.message);
        return res.status(500).json({ message: "Could not send the connection request." });
    }
};

const getSentRequests = async (req, res) => {
    const requesterId = req.user.id;

    try {
        const requests = await Connection.find({
            requesterId,
            status: "pending"
        })
            .populate("recipientId", "name username profilePicture")
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            count: requests.length,
            requests
        });
    } catch (error) {
        console.error("Error fetching sent connection requests:", error.message);
        return res.status(500).json({ message: "Could not retrieve sent connection requests." });
    }
};

const getReceivedRequests = async (req, res) => {
    const recipientId = req.user.id;

    try {
        const requests = await Connection.find({
            recipientId,
            status: "pending"
        })
            .populate("requesterId", "name username profilePicture")
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            count: requests.length,
            requests
        });
    } catch (error) {
        console.error("Error fetching received connection requests:", error.message);
        return res.status(500).json({ message: "Could not retrieve connection requests." });
    }
};

const acceptConnectionRequest = async (req, res) => {
    const recipientId = req.user.id;
    const { requestId } = req.params;

    if (!mongoose.isValidObjectId(requestId)) {
        return res.status(400).json({ message: "Invalid connection request." });
    }

    try {
        const connection = await Connection.findOneAndUpdate(
            {
                _id: requestId,
                recipientId,
                status: "pending"
            },
            {
                $set: { status: "accepted" }
            },
            {
                new: true
            }
        )
            .populate("requesterId", "name username profilePicture")
            .populate("recipientId", "name username profilePicture");

        if (!connection) {
            return res.status(404).json({ message: "Pending connection request not found." });
        }

        await Notification.deleteMany({
            recipientId,
            type: "connection_request",
            connectionId: connection._id
        });

        await Notification.create({
            recipientId: connection.requesterId._id,
            actorId: recipientId,
            type: "connection_accepted",
            connectionId: connection._id
        });

        return res.status(200).json({
            message: "Connection request accepted.",
            connection
        });
    } catch (error) {
        console.error("Error accepting connection request:", error.message);
        return res.status(500).json({ message: "Could not accept the connection request." });
    }
};

const deleteConnectionRequest = async (req, res) => {
    const recipientId = req.user.id;
    const { requestId } = req.params;

    if (!mongoose.isValidObjectId(requestId)) {
        return res.status(400).json({ message: "Invalid connection request." });
    }

    try {
        const connection = await Connection.findOneAndDelete({
            _id: requestId,
            recipientId,
            status: "pending"
        });

        if (!connection) {
            return res.status(404).json({ message: "Pending connection request not found." });
        }

        await Notification.deleteMany({
            recipientId,
            type: "connection_request",
            connectionId: connection._id
        });

        return res.status(200).json({
            message: "Connection request deleted.",
            requestId: connection._id
        });
    } catch (error) {
        console.error("Error deleting connection request:", error.message);
        return res.status(500).json({ message: "Could not delete the connection request." });
    }
};

const getMyConnections = async (req, res) => {
    const userId = req.user.id;

    try {
        const connections = await Connection.find({
            status: "accepted",
            $or: [
                { requesterId: userId },
                { recipientId: userId }
            ]
        })
            .populate("requesterId", "name username profilePicture")
            .populate("recipientId", "name username profilePicture")
            .sort({ updatedAt: -1 })
            .lean();

        const people = connections
            .filter((connection) => connection.requesterId && connection.recipientId)
            .map((connection) => {
                const requesterIsCurrentUser =
                    connection.requesterId._id.toString() === userId.toString();

                return {
                    connectionId: connection._id,
                    connectedAt: connection.updatedAt,
                    user: requesterIsCurrentUser
                        ? connection.recipientId
                        : connection.requesterId
                };
            });

        return res.status(200).json({
            count: people.length,
            connections: people
        });
    } catch (error) {
        console.error("Error fetching connections:", error.message);
        return res.status(500).json({ message: "Could not retrieve connections." });
    }
};

export default {
    sendConnectionRequest,
    getSentRequests,
    getReceivedRequests,
    acceptConnectionRequest,
    deleteConnectionRequest,
    getMyConnections
};

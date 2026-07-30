import Story from "../models/story.model.js";
import User from "../models/user.model.js";
import Connection from "../models/connections.model.js";
import mongoose from "mongoose";

const createStory = async (req, res) => {
  const userId = req.user.id;
  const { mediaUrl, mediaPublicId, mediaResourceType, caption } = req.body;

  if (!mediaUrl) {
    return res.status(400).json({ message: "Media URL is required." });
  }

  try {
    const newStory = await Story.create({
      userId,
      mediaUrl,
      mediaPublicId: mediaPublicId || "",
      mediaResourceType: mediaResourceType || "video",
      caption: caption ? caption.trim().slice(0, 200) : "",
    });

    await newStory.populate("userId", "name username profilePicture");

    return res.status(201).json({
      message: "Story posted successfully!",
      story: newStory,
    });
  } catch (error) {
    console.error("Error creating story:", error);
    return res.status(500).json({ message: "Could not post story." });
  }
};

const getActiveStories = async (req, res) => {
  const userId = req.user.id;

  try {
    const now = new Date();

    // Get user's connections to prioritize their stories
    const userConnections = await Connection.find({
      $or: [{ requesterId: userId }, { recipientId: userId }],
      status: "accepted",
    }).select("requesterId recipientId");

    const connectedUserIds = userConnections.map((conn) =>
      conn.requesterId.toString() === userId.toString()
        ? conn.recipientId
        : conn.requesterId
    );

    // Get all active stories unexpired
    const stories = await Story.find({
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: 1 })
      .populate("userId", "name username profilePicture")
      .populate("viewers.userId", "name username profilePicture")
      .lean();

    // Group stories by user
    const storiesByUserMap = new Map();

    stories.forEach((story) => {
      const authorId = story.userId._id.toString();
      if (!storiesByUserMap.has(authorId)) {
        storiesByUserMap.set(authorId, {
          user: story.userId,
          isCurrentUser: authorId === userId.toString(),
          isConnection: connectedUserIds.some(
            (id) => id.toString() === authorId
          ),
          hasUnseen: story.viewers.every(
            (v) => v.userId?._id?.toString() !== userId.toString()
          ),
          stories: [],
        });
      }

      const group = storiesByUserMap.get(authorId);
      const isUnseen = story.viewers.every(
        (v) => v.userId?._id?.toString() !== userId.toString()
      );
      if (isUnseen) group.hasUnseen = true;

      group.stories.push(story);
    });

    const userStoryGroups = Array.from(storiesByUserMap.values());

    // Sort: Current user first, then users with unseen stories, then connections, then rest
    userStoryGroups.sort((a, b) => {
      if (a.isCurrentUser) return -1;
      if (b.isCurrentUser) return 1;
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      if (a.isConnection !== b.isConnection) return a.isConnection ? -1 : 1;
      return 0;
    });

    return res.status(200).json({ storyGroups: userStoryGroups });
  } catch (error) {
    console.error("Error fetching stories:", error);
    return res.status(500).json({ message: "Could not fetch stories." });
  }
};

const viewStory = async (req, res) => {
  const { storyId } = req.params;
  const userId = req.user.id;

  if (!mongoose.isValidObjectId(storyId)) {
    return res.status(400).json({ message: "Invalid story ID." });
  }

  try {
    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ message: "Story not found or expired." });
    }

    const alreadyViewed = story.viewers.some(
      (v) => v.userId.toString() === userId.toString()
    );

    if (!alreadyViewed) {
      story.viewers.push({ userId, viewedAt: new Date() });
      await story.save();
    }

    return res.status(200).json({
      success: true,
      viewersCount: story.viewers.length,
    });
  } catch (error) {
    console.error("Error viewing story:", error);
    return res.status(500).json({ message: "Could not record story view." });
  }
};

const likeStory = async (req, res) => {
  const { storyId } = req.params;
  const userId = req.user.id;

  if (!mongoose.isValidObjectId(storyId)) {
    return res.status(400).json({ message: "Invalid story ID." });
  }

  try {
    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ message: "Story not found or expired." });
    }

    const likedIndex = story.likes.findIndex(
      (id) => id.toString() === userId.toString()
    );

    if (likedIndex > -1) {
      story.likes.splice(likedIndex, 1);
    } else {
      story.likes.push(userId);
    }

    await story.save();

    return res.status(200).json({
      liked: likedIndex === -1,
      likesCount: story.likes.length,
    });
  } catch (error) {
    console.error("Error liking story:", error);
    return res.status(500).json({ message: "Could not like story." });
  }
};

const deleteStory = async (req, res) => {
  const { storyId } = req.params;
  const userId = req.user.id;

  if (!mongoose.isValidObjectId(storyId)) {
    return res.status(400).json({ message: "Invalid story ID." });
  }

  try {
    const story = await Story.findOne({ _id: storyId, userId });
    if (!story) {
      return res.status(404).json({ message: "Story not found or unauthorized." });
    }

    await Story.deleteOne({ _id: storyId });

    return res.status(200).json({ message: "Story deleted successfully." });
  } catch (error) {
    console.error("Error deleting story:", error);
    return res.status(500).json({ message: "Could not delete story." });
  }
};

export default {
  createStory,
  getActiveStories,
  viewStory,
  likeStory,
  deleteStory,
};

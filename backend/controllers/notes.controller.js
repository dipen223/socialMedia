import multer from "multer";
import mongoose from "mongoose";
import Note from "../models/note.model.js";
import { transcribeAudio, extractNoteInsights } from "../services/ai.service.js";

const MAX_NOTE_LENGTH = 10000;

// Cheap, local, zero-cost gate on the AI enrichment call: most notes ("buy
// milk", "great idea for the landing page") have nothing reminder-worthy in
// them, so there's no reason to pay for a model call just to confirm that.
// Only notes that look like they might contain a date/time reference reach
// extractNoteInsights at all - everything else gets a free local title
// instead and skips the call entirely.
const REMINDER_CUE_PATTERN = new RegExp(
    [
        "\\bremind(er|ers|s)?\\b",
        "\\btomorrow\\b",
        "\\btonight\\b",
        "\\btoday\\b",
        "\\bnext\\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b",
        "\\b(mon|tues?|wednes?|thurs?|fri|satur?|sun)day\\b",
        "\\b\\d{1,2}(:\\d{2})?\\s*(am|pm)\\b",
        "\\b\\d{1,2}\\/\\d{1,2}(\\/\\d{2,4})?\\b",
        "\\bin\\s+\\d+\\s+(minute|hour|day|week|month)s?\\b",
        "\\bat\\s+\\d{1,2}(:\\d{2})?\\b",
    ].join("|"),
    "i"
);

// A free stand-in for the AI-written title when enrichment doesn't run -
// just the note's first line, trimmed to a sane length.
const fallbackTitle = (content) => {
    const firstLine = content.split("\n")[0].trim();
    if (!firstLine) return "";
    return firstLine.length > 60 ? `${firstLine.slice(0, 57).trimEnd()}...` : firstLine;
};

const voiceUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 24 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
        const supported = [
            "audio/webm",
            "video/webm",
            "audio/ogg",
            "audio/mp4",
        ].includes(file.mimetype);
        callback(
            supported ? null : new Error("Unsupported voice note format."),
            supported
        );
    },
}).single("audio");

export const uploadVoiceNote = (req, res, next) => {
    voiceUpload(req, res, (error) => {
        if (!error) return next();
        const isTooLarge = error.code === "LIMIT_FILE_SIZE";
        return res.status(400).json({
            message: isTooLarge
                ? "That recording is too long to process."
                : error.message,
        });
    });
};

const emitNote = (io, userId, event, note) => {
    io?.to(`user:${userId}`).emit(event, { note });
};

// AI enrichment (title/tags/reminders) is optional and can take several
// seconds, so it runs AFTER the note is already saved and the response is
// sent - never in the write path. When it lands, the enriched note is pushed
// to every device the user has open via `note:updated`. Failure is swallowed:
// the note simply keeps its raw content.
//
// The result is merged, not written over the note: enrichment finishes seconds
// after the save, so the user may already have edited tags or dismissed a
// reminder. Tags are only filled in when the note has none (an explicit
// reanalyze replaces them), and reminders are appended rather than replacing
// the array, skipping ones already present so a dismissed reminder stays dismissed.
const enrichNoteInBackground = async ({ io, userId, noteId, content, timezone, keepTitle, overwriteTags = false }) => {
    try {
        const insights = await extractNoteInsights({ text: content, timezone });

        const current = await Note.findOne({ _id: noteId, userId }).select("tags reminders");
        if (!current) return;

        const set = {};
        if (!keepTitle && insights.title) set.title = insights.title;
        if (overwriteTags || current.tags.length === 0) set.tags = insights.tags;

        const known = new Set(
            current.reminders.map((reminder) => `${reminder.text}|${reminder.dueAt.getTime()}`)
        );
        const fresh = insights.reminders.filter(
            (reminder) => !known.has(`${reminder.text}|${reminder.dueAt.getTime()}`)
        );

        const update = { $set: set };
        if (fresh.length) update.$push = { reminders: { $each: fresh } };

        const note = await Note.findOneAndUpdate(
            { _id: noteId, userId },
            update,
            { new: true }
        );
        if (note) emitNote(io, userId, "note:updated", note);
    } catch (error) {
        console.error("Note enrichment failed:", error.message);
    }
};

const createNote = async (req, res) => {
    const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const timezone = typeof req.body.timezone === "string" ? req.body.timezone : "";

    if (!content) {
        return res.status(400).json({ message: "Write something before saving a note." });
    }
    if (content.length > MAX_NOTE_LENGTH) {
        return res.status(400).json({ message: `Notes cannot exceed ${MAX_NOTE_LENGTH} characters.` });
    }

    try {
        const note = await Note.create({
            userId: req.user.id,
            content,
            title: title || fallbackTitle(content),
            source: "typed",
        });
        res.status(201).json({ note });

        if (REMINDER_CUE_PATTERN.test(content)) {
            enrichNoteInBackground({
                io: req.app.get("io"),
                userId: req.user.id,
                noteId: note._id,
                content,
                timezone,
                keepTitle: Boolean(title),
            });
        }
    } catch (error) {
        console.error("Could not create note:", error.message);
        return res.status(500).json({ message: "Could not save that note." });
    }
};

const createVoiceNote = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No recording was received." });
    }

    const timezone = typeof req.body.timezone === "string" ? req.body.timezone : "";
    const conversationId = mongoose.isValidObjectId(req.body.conversationId)
        ? req.body.conversationId
        : null;
    const callId = typeof req.body.callId === "string" ? req.body.callId : null;

    try {
        const { text } = await transcribeAudio({
            buffer: req.file.buffer,
            mimeType: req.file.mimetype,
        });

        if (!text) {
            return res.status(422).json({ message: "No speech was detected in that recording." });
        }

        const io = req.app.get("io");
        const note = await Note.create({
            userId: req.user.id,
            content: text,
            title: fallbackTitle(text),
            source: conversationId || callId ? "call" : "voice",
            conversationId,
            callId,
        });

        // A note taken mid-call - let an open Notes tab (or the call screen)
        // pick it up without a manual refresh.
        if (conversationId || callId) {
            emitNote(io, req.user.id, "note:new", note);
        }

        res.status(201).json({ note });

        if (REMINDER_CUE_PATTERN.test(text)) {
            enrichNoteInBackground({
                io,
                userId: req.user.id,
                noteId: note._id,
                content: text,
                timezone,
                keepTitle: false,
            });
        }
    } catch (error) {
        console.error("Could not create voice note:", error.message);
        const status = error.status === 503 ? 503 : 500;
        return res.status(status).json({
            message: status === 503 ? error.message : "Could not save that voice note.",
        });
    }
};

const listNotes = async (req, res) => {
    const { search, tag, pinned, archived } = req.query;

    const query = { userId: req.user.id };
    query.archived = archived === "true";
    if (pinned === "true") query.pinned = true;
    if (tag) query.tags = tag.toLowerCase();
    if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
            { title: { $regex: escaped, $options: "i" } },
            { content: { $regex: escaped, $options: "i" } },
        ];
    }

    try {
        const notes = await Note.find(query)
            .sort({ pinned: -1, createdAt: -1 })
            .lean();
        return res.status(200).json({ notes });
    } catch (error) {
        console.error("Could not fetch notes:", error.message);
        return res.status(500).json({ message: "Could not retrieve notes." });
    }
};

const updateNote = async (req, res) => {
    const { noteId } = req.params;
    if (!mongoose.isValidObjectId(noteId)) {
        return res.status(400).json({ message: "Invalid note." });
    }

    const updates = {};
    if (typeof req.body.title === "string") updates.title = req.body.title.trim();
    if (typeof req.body.content === "string") {
        const content = req.body.content.trim();
        if (!content) {
            return res.status(400).json({ message: "A note can't be empty." });
        }
        if (content.length > MAX_NOTE_LENGTH) {
            return res.status(400).json({ message: `Notes cannot exceed ${MAX_NOTE_LENGTH} characters.` });
        }
        updates.content = content;
    }
    if (Array.isArray(req.body.tags)) {
        updates.tags = req.body.tags
            .filter((tag) => typeof tag === "string" && tag.trim())
            .slice(0, 5)
            .map((tag) => tag.trim().toLowerCase().slice(0, 40));
    }
    if (typeof req.body.pinned === "boolean") updates.pinned = req.body.pinned;
    if (typeof req.body.archived === "boolean") updates.archived = req.body.archived;

    try {
        const note = await Note.findOneAndUpdate(
            { _id: noteId, userId: req.user.id },
            { $set: updates },
            { new: true }
        );

        if (!note) {
            return res.status(404).json({ message: "Note not found." });
        }

        res.status(200).json({ note });

        // Re-running enrichment is only ever an explicit request (not part of
        // an autosave), and like the create path it happens off the response -
        // the re-analyzed note arrives later over `note:updated`.
        if (req.body.reanalyze && note.content) {
            enrichNoteInBackground({
                io: req.app.get("io"),
                userId: req.user.id,
                noteId: note._id,
                content: note.content,
                timezone: typeof req.body.timezone === "string" ? req.body.timezone : "",
                keepTitle: typeof req.body.title === "string" && req.body.title.trim().length > 0,
                overwriteTags: true,
            });
        }
        return undefined;
    } catch (error) {
        console.error("Could not update note:", error.message);
        return res.status(500).json({ message: "Could not update that note." });
    }
};

const deleteNote = async (req, res) => {
    const { noteId } = req.params;
    if (!mongoose.isValidObjectId(noteId)) {
        return res.status(400).json({ message: "Invalid note." });
    }

    try {
        const note = await Note.findOneAndDelete({ _id: noteId, userId: req.user.id });
        if (!note) {
            return res.status(404).json({ message: "Note not found." });
        }
        return res.status(200).json({ message: "Note deleted." });
    } catch (error) {
        console.error("Could not delete note:", error.message);
        return res.status(500).json({ message: "Could not delete that note." });
    }
};

const dismissReminder = async (req, res) => {
    const { noteId, reminderId } = req.params;
    if (!mongoose.isValidObjectId(noteId) || !mongoose.isValidObjectId(reminderId)) {
        return res.status(400).json({ message: "Invalid reminder." });
    }

    try {
        const note = await Note.findOneAndUpdate(
            { _id: noteId, userId: req.user.id, "reminders._id": reminderId },
            { $set: { "reminders.$.notifiedAt": new Date() } },
            { new: true }
        );

        if (!note) {
            return res.status(404).json({ message: "Reminder not found." });
        }

        return res.status(200).json({ note });
    } catch (error) {
        console.error("Could not dismiss reminder:", error.message);
        return res.status(500).json({ message: "Could not dismiss that reminder." });
    }
};

export default {
    createNote,
    createVoiceNote,
    listNotes,
    updateNote,
    deleteNote,
    dismissReminder,
};

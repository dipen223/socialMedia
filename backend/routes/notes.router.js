import express from "express";
import notesController, { uploadVoiceNote } from "../controllers/notes.controller.js";
import auth from "../middlewares/auth.js";

const notesRouter = express.Router();

notesRouter.get("/notes", auth, notesController.listNotes);
notesRouter.post("/notes", auth, notesController.createNote);
notesRouter.post(
    "/notes/voice",
    auth,
    uploadVoiceNote,
    notesController.createVoiceNote
);
notesRouter.patch("/notes/:noteId", auth, notesController.updateNote);
notesRouter.delete("/notes/:noteId", auth, notesController.deleteNote);
notesRouter.patch(
    "/notes/:noteId/reminders/:reminderId/dismiss",
    auth,
    notesController.dismissReminder
);

export default notesRouter;

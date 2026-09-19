import Note from "../models/note.model.js";
import Notification from "../models/notification.model.js";

// Polls for note reminders that have come due and turns each one into a
// Notification, pushed live over the same `user:<id>` socket room every other
// live event in this app uses. There's no queue/cron dependency in this
// codebase yet, so a simple interval poll (see server.js) is the right size
// for this feature's volume rather than introducing one.

export const checkDueReminders = async (io) => {
    const now = new Date();

    const dueNotes = await Note.find({
        reminders: {
            $elemMatch: { dueAt: { $lte: now }, notifiedAt: null },
        },
    }).select("userId reminders");

    for (const note of dueNotes) {
        const dueReminders = note.reminders.filter(
            (reminder) => !reminder.notifiedAt && reminder.dueAt <= now
        );

        for (const reminder of dueReminders) {
            // Atomically claim this one reminder before acting on it. If a
            // second server instance is polling the same row, only one $set
            // matches the `notifiedAt: null` filter - the loser gets null back
            // and skips, so the notification is sent exactly once.
            const claimed = await Note.findOneAndUpdate(
                {
                    _id: note._id,
                    reminders: {
                        $elemMatch: { _id: reminder._id, notifiedAt: null },
                    },
                },
                { $set: { "reminders.$.notifiedAt": now } }
            );
            if (!claimed) continue;

            try {
                const notification = await Notification.create({
                    recipientId: note.userId,
                    actorId: note.userId,
                    type: "note_reminder",
                    noteId: note._id,
                });
                io?.to(`user:${note.userId}`).emit("note:reminder", {
                    notification,
                    noteId: note._id,
                    reminder: { text: reminder.text, dueAt: reminder.dueAt },
                });
            } catch (error) {
                console.error(
                    `Could not deliver reminder for note ${note._id}:`,
                    error.message
                );
                // Release the claim so the next poll retries this reminder
                // rather than silently dropping it.
                await Note.updateOne(
                    { _id: note._id, "reminders._id": reminder._id },
                    { $set: { "reminders.$.notifiedAt": null } }
                ).catch(() => {});
            }
        }
    }
};

export const startReminderPolling = (io, intervalMs = 60000) => {
    const poll = () => {
        checkDueReminders(io).catch((error) =>
            console.error("Reminder poll failed:", error.message)
        );
    };
    poll();
    return setInterval(poll, intervalMs);
};

import ReminderBadge from "@/components/dashboard/Notes/ReminderBadge";
import styles from "./NoteCard.module.css";

const PinIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M12 2a5 5 0 0 0-5 5c0 3.5 2 5.7 3 6.7L8 22l4-3 4 3-2-8.3c1-1 3-3.2 3-6.7a5 5 0 0 0-5-5z" />
  </svg>
);

const ArchiveIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
    <line x1="10" y1="13" x2="14" y2="13" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" /><path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const SOURCE_LABEL = {
  typed: null,
  voice: "Voice note",
  call: "Taken during a call",
};

const formatDate = (value) => {
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
};

export default function NoteCard({ note, onUpdate, onDelete, onDismissReminder }) {
  const activeReminders = (note.reminders || []).filter((reminder) => !reminder.notifiedAt);
  const sourceLabel = SOURCE_LABEL[note.source];

  return (
    <article className={`${styles.card} ${note.pinned ? styles.pinned : ""}`}>
      <header className={styles.header}>
        <div>
          {note.title && <h3 className={styles.title}>{note.title}</h3>}
          <span className={styles.meta}>
            {formatDate(note.createdAt)}
            {sourceLabel ? ` · ${sourceLabel}` : ""}
          </span>
        </div>
        <div className={styles.cardActions}>
          <button
            type="button"
            className={note.pinned ? styles.iconButtonActive : styles.iconButton}
            onClick={() => onUpdate(note._id, { pinned: !note.pinned })}
            aria-label={note.pinned ? "Unpin note" : "Pin note"}
            aria-pressed={note.pinned}
          >
            <PinIcon />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onUpdate(note._id, { archived: !note.archived })}
            aria-label={note.archived ? "Unarchive note" : "Archive note"}
          >
            <ArchiveIcon />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onDelete(note._id)}
            aria-label="Delete note"
          >
            <TrashIcon />
          </button>
        </div>
      </header>

      <p className={styles.content}>{note.content}</p>

      {note.tags?.length > 0 && (
        <ul className={styles.tags}>
          {note.tags.map((tag) => (
            <li key={tag}>#{tag}</li>
          ))}
        </ul>
      )}

      {activeReminders.length > 0 && (
        <div className={styles.reminders}>
          {activeReminders.map((reminder) => (
            <ReminderBadge
              key={reminder._id}
              reminder={reminder}
              onDismiss={(reminderId) => onDismissReminder(note._id, reminderId)}
            />
          ))}
        </div>
      )}
    </article>
  );
}

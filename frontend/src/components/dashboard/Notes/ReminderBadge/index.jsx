import styles from "./ReminderBadge.module.css";

const BellIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

const formatDueAt = (dueAt) => {
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(dueAt));
  } catch {
    return dueAt;
  }
};

export default function ReminderBadge({ reminder, onDismiss }) {
  return (
    <div className={styles.badge}>
      <BellIcon />
      <span className={styles.text}>{reminder.text}</span>
      <span className={styles.time}>{formatDueAt(reminder.dueAt)}</span>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => onDismiss?.(reminder._id)}
        aria-label="Dismiss reminder"
      >
        ×
      </button>
    </div>
  );
}

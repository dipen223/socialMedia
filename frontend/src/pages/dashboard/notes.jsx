import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import NoteComposer from "@/components/dashboard/Notes/NoteComposer";
import NoteCard from "@/components/dashboard/Notes/NoteCard";
import { clientServer } from "@/config";
import { getSocket } from "@/config/socket";
import styles from "@/styles/notesPage.module.css";

const NotesIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);

export default function NotesPage() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = { archived: showArchived };
      if (search.trim()) params.search = search.trim();
      if (activeTag) params.tag = activeTag;
      const res = await clientServer.get("/notes", { params });
      setNotes(res.data?.notes || []);
    } catch (err) {
      console.error("Failed to fetch notes:", err);
    } finally {
      setLoading(false);
    }
  }, [search, activeTag, showArchived]);

  useEffect(() => {
    const timeoutId = setTimeout(fetchNotes, search ? 300 : 0);
    return () => clearTimeout(timeoutId);
  }, [fetchNotes, search]);

  // Live updates: `note:new` fires when a note is taken mid-call, `note:updated`
  // when background AI enrichment (title/tags/reminders) lands. Both merge by
  // id, so an already-listed note is updated in place rather than duplicated.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const mergeNote = ({ note }) => {
      if (!note?._id) return;
      setNotes((prev) => {
        if (prev.some((existing) => existing._id === note._id)) {
          return prev.map((existing) =>
            existing._id === note._id ? note : existing
          );
        }
        return note.archived === showArchived ? [note, ...prev] : prev;
      });
    };

    socket.on("note:new", mergeNote);
    socket.on("note:updated", mergeNote);
    return () => {
      socket.off("note:new", mergeNote);
      socket.off("note:updated", mergeNote);
    };
  }, [showArchived]);

  const allTags = useMemo(() => {
    const tagSet = new Set();
    notes.forEach((note) => note.tags?.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet);
  }, [notes]);

  const handleCreated = (note) => {
    if (!note) return;
    setNotes((prev) => (note.archived === showArchived ? [note, ...prev] : prev));
  };

  const handleUpdate = async (noteId, updates) => {
    setNotes((prev) =>
      prev
        .map((note) => (note._id === noteId ? { ...note, ...updates } : note))
        .filter((note) => note.archived === showArchived)
    );
    try {
      await clientServer.patch(`/notes/${noteId}`, updates);
    } catch (err) {
      console.error("Failed to update note:", err);
      fetchNotes();
    }
  };

  const handleDelete = async (noteId) => {
    const previous = notes;
    setNotes((prev) => prev.filter((note) => note._id !== noteId));
    try {
      await clientServer.delete(`/notes/${noteId}`);
    } catch (err) {
      console.error("Failed to delete note:", err);
      setNotes(previous);
    }
  };

  const handleDismissReminder = async (noteId, reminderId) => {
    setNotes((prev) =>
      prev.map((note) =>
        note._id === noteId
          ? {
              ...note,
              reminders: note.reminders.map((reminder) =>
                reminder._id === reminderId
                  ? { ...reminder, notifiedAt: new Date().toISOString() }
                  : reminder
              ),
            }
          : note
      )
    );
    try {
      await clientServer.patch(`/notes/${noteId}/reminders/${reminderId}/dismiss`);
    } catch (err) {
      console.error("Failed to dismiss reminder:", err);
    }
  };

  return (
    <DashboardLayout>
      <div className={styles.page}>
        <header className={styles.heroHeader}>
          <h1>
            <NotesIcon /> Notes
          </h1>
          <p>Type or speak a note. SocialHub organizes it and reminds you when it matters.</p>
        </header>

        <NoteComposer onCreated={handleCreated} />

        <div className={styles.filterBar}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search notes..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="button"
            className={showArchived ? styles.toggleActive : styles.toggle}
            onClick={() => setShowArchived((value) => !value)}
          >
            {showArchived ? "Archived" : "Active"}
          </button>
        </div>

        {allTags.length > 0 && (
          <div className={styles.tagBar}>
            <button
              type="button"
              className={!activeTag ? styles.tagChipActive : styles.tagChip}
              onClick={() => setActiveTag("")}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={activeTag === tag ? styles.tagChipActive : styles.tagChip}
                onClick={() => setActiveTag(tag === activeTag ? "" : tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        <div className={styles.list}>
          {loading && (
            <div role="status" aria-label="Loading notes">
              <div className={styles.skeleton} />
              <div className={styles.skeleton} />
              <div className={styles.skeleton} />
            </div>
          )}

          {!loading && notes.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <NotesIcon />
              </div>
              <strong>{showArchived ? "No archived notes" : "No notes yet"}</strong>
              <p>Type something above or tap Record to speak your first note.</p>
            </div>
          )}

          {!loading &&
            notes.map((note) => (
              <NoteCard
                key={note._id}
                note={note}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onDismissReminder={handleDismissReminder}
              />
            ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

import { useEffect, useState } from "react";
import { clientServer } from "@/config";
import styles from "./ReactionDetails.module.css";

export default function ReactionDetails({ postId, open, onClose }) {
    const [reactions, setReactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;

        const loadReactions = async () => {
            setLoading(true);
            setError("");
            try {
                const response = await clientServer.get(`/post/${postId}/reactions`);

                setReactions(response.data.reactions || []);


            } catch (error) {
                setError(
                    error.response?.data?.message ||
                    error.message ||
                    "Could not load reactions."
                );


            } finally {
                setLoading(false);

            }

        };


        loadReactions();
    }, [open, postId]);

    useEffect(() => {
        if (!open) return undefined;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const handleKeyDown = (event) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={`reaction-details-${postId}`}>
                <header className={styles.header}>
                    <div>
                        <h2 id={`reaction-details-${postId}`}>Reactions</h2>
                        <p>{reactions.length} {reactions.length === 1 ? "person" : "people"}</p>
                    </div>
                    <button className={styles.close} type="button" onClick={onClose} aria-label="Close reaction details">×</button>
                </header>

                {loading && <p className={styles.status}>Loading reactions...</p>}

                {error && <p className={styles.error} role="alert">{error}</p>}

                {!loading && !error && reactions.length === 0 && (
                    <p className={styles.status}>No reactions yet.</p>
                )}

                {!loading && !error && reactions.length > 0 && (
                    <ul className={styles.list}>
                        {reactions.map((item) => {
                            const user = item.user;
                            if (!user) return null;
                            const hasPicture = user.profilePicture && user.profilePicture !== "default.jpg";
                            const initials = user.name
                                ?.split(" ")
                                .map((part) => part[0])
                                .slice(0, 2)
                                .join("")
                                .toUpperCase() || "R";

                            return (
                                <li key={`${item.type}-${user._id}`}>
                                    <span className={styles.avatar}>
                                        {hasPicture ? <img src={user.profilePicture} alt="" /> : initials}
                                    </span>
                                    <span className={styles.user}>
                                        <strong>{user.name || "SocialHub member"}</strong>
                                        {user.username && <span>@{user.username}</span>}
                                    </span>
                                    {item.type === "facemoji" && item.reaction ? (
                                        <span className={styles.faceReaction}>
                                            <img src={item.reaction.imageUrl} alt="" />
                                            <span>{item.reaction.name}</span>
                                        </span>
                                    ) : (
                                        <span className={styles.like} aria-label="Liked">👍</span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
}

import { useCallback, useEffect, useRef, useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ReelCard from "@/components/dashboard/ReelCard";
import { clientServer } from "@/config";
import { fetchReels } from "@/config/reels";
import styles from "@/styles/reels.module.css";

const PAGE_SIZE = 5;

export default function ReelsPage() {
    const [reels, setReels] = useState([]);
    const [cursor, setCursor] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    // Mute lives at the feed level, not per card - unmuting one reel should
    // keep sound on as you swipe to the next, like every short-video app.
    // Starts muted because browsers only permit autoplay while muted.
    const [muted, setMuted] = useState(true);
    const [notice, setNotice] = useState("");

  
    const inFlightRef = useRef(false);
    // After a failed page load, wait before the next scroll event may retry -
    // otherwise every scroll tick re-fires the failing request.
    const retryAfterRef = useRef(0);

    // Notices are one-shot confirmations - let them go after a few seconds.
    useEffect(() => {
        if (!notice) return undefined;
        const timer = setTimeout(() => setNotice(""), 3000);
        return () => clearTimeout(timer);
    }, [notice]);

    useEffect(() => {
      
        let cancelled = false;

        (async () => {
            try {
                const data = await fetchReels({ limit: PAGE_SIZE });
                if (cancelled) return;
                setReels(data.reels || []);
                setCursor(data.nextCursor || null);
            } catch (err) {
                if (!cancelled) setError(err.response?.data?.message || "Could not load reels.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const loadMore = useCallback(async () => {
        if (!cursor || inFlightRef.current || Date.now() < retryAfterRef.current) return;
        inFlightRef.current = true;
        setLoadingMore(true);
        try {
            // `before: cursor` - "the ones older than what I already have",
            // not "page N". New reels posted while scrolling can't shift this.
            const data = await fetchReels({ before: cursor, limit: PAGE_SIZE });
            setReels((previous) => [...previous, ...(data.reels || [])]);
            setCursor(data.nextCursor || null);
            setError("");
        } catch (err) {
            retryAfterRef.current = Date.now() + 5000;
            setError(err.response?.data?.message || "Could not load more reels.");
        } finally {
            inFlightRef.current = false;
            setLoadingMore(false);
        }
    }, [cursor]);

    // Fetch the next page once the viewer is within ~2 slides of the end,
    // so the next video is already there by the time they swipe to it.
    const handleScroll = (event) => {
        const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
        if (scrollHeight - (scrollTop + clientHeight) < clientHeight * 2) {
            loadMore();
        }
    };

    const handleRepost = async (reel) => {
        try {
            const { data } = await clientServer.post(`/post/${reel._id}/repost`);
            setNotice(data.message || "Shared to your profile.");
        } catch (err) {
            setNotice(err.response?.data?.message || "Could not share this reel.");
        }
    };

    const handleShare = async (reel) => {
        const url = `${window.location.origin}/dashboard/posts/${reel._id}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: "SocialHub reel", text: reel.body, url });
            } else {
                await navigator.clipboard.writeText(url);
                setNotice("Link copied.");
            }
        } catch (err) {
            if (err.name !== "AbortError") setNotice("Could not share this reel.");
        }
    };

    return (
        <DashboardLayout wide>
            <div className={styles.page}>
                <header className={styles.header}>
                    <h1>Reels</h1>
                </header>

                {loading && <div className={styles.status}>Loading reels...</div>}
                {error && <div className={styles.error}>{error}</div>}

                {notice && <div className={styles.notice} role="status">{notice}</div>}

                {!loading && !error && reels.length === 0 && (
                    <div className={styles.status}>
                        <strong>No reels yet</strong>
                        <p>Post a video from the composer and it shows up here automatically.</p>
                    </div>
                )}

                {reels.length > 0 && (
                    // scroll-snap-type: y mandatory on this container (see the
                    // CSS) is what makes a swipe always land squarely on one
                    // reel instead of stopping between two.
                    <div className={styles.viewport} onScroll={handleScroll}>
                        {reels.map((reel) => (
                            <ReelCard
                                key={reel._id}
                                reel={reel}
                                muted={muted}
                                onToggleMute={() => setMuted((value) => !value)}
                                onShare={handleShare}
                                onRepost={handleRepost}
                            />
                        ))}

                        {loadingMore && <div className={styles.status}>Loading more...</div>}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}

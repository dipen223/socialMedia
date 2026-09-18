// AI feed ranking — v1: a weighted scoring function, not a trained model.
// Every platform's first ranked feed (Facebook's original EdgeRank, Reddit's
// "hot") worked this way: pick a handful of signals, combine them into one
// number per post, sort by that number instead of by timestamp. Swapping the
// hand-picked weights below for a model trained on real click/like data is a
// natural next step once there's usage data to learn from - the shape
// (signals in, score out, sort by score) stays the same either way.

// How fast a post's raw engagement "fades" with age. A HALF_LIFE_HOURS of 24
// means: all else equal, a post's contribution to its own score is cut in
// half every 24 hours. This is the same idea Reddit's "hot" ranking popularized.
export const HALF_LIFE_HOURS = 24;

// Comments take more effort than a tap, so they count for more than likes;
// a face reaction (picking a specific emoji) sits between the two.
export const ENGAGEMENT_WEIGHTS = {
    like: 1,
    reaction: 2,
    comment: 4,
};

// Flat, decay-independent bonuses (added on top of the decayed engagement
// score, not multiplied into it) - being a friend or having an active live
// room is valuable regardless of how "stale" the post's own engagement is.
export const AFFINITY_BONUS = 6; // author is one of the viewer's accepted connections
export const LIVE_ROOM_BONUS = 8; // post has a discussion room that's live right now

// Exponential decay from a post's age in hours - 1 at age 0, 0.5 at one
// half-life, 0.25 at two half-lives, approaching (never reaching) 0 as a post
// ages. Exponential rather than linear so a two-day-old post doesn't fall off
// a cliff, it just keeps fading.
export const recencyDecay = (ageInHours, halfLifeHours = HALF_LIFE_HOURS) => {
    const age = Number.isFinite(ageInHours) ? Math.max(0, ageInHours) : 0;
    return Math.pow(0.5, age / halfLifeHours);
};

// A single post's rank score. The "1 +" baseline on engagement matters more
// than it looks: without it, two brand-new posts with zero likes/comments
// would both score exactly 0 and tie, losing recency ordering entirely for
// the (very common) case of a fresh, not-yet-engaged-with post. With it,
// recency alone still orders zero-engagement posts, and real engagement
// multiplies on top of that baseline.
export const scorePost = (post, { isConnection = false, now = new Date() } = {}) => {
    const createdAt = new Date(post.createdAt);
    const ageInHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

    const likes = post.likedBy?.length || 0;
    const reactions = post.faceReactions?.length || 0;
    const comments = post.commentCount || 0;

    const engagementScore =
        1 +
        ENGAGEMENT_WEIGHTS.like * likes +
        ENGAGEMENT_WEIGHTS.reaction * reactions +
        ENGAGEMENT_WEIGHTS.comment * comments;

    const decay = recencyDecay(ageInHours);
    const affinityBonus = isConnection ? AFFINITY_BONUS : 0;
    const liveRoomBonus = post.liveDiscussion ? LIVE_ROOM_BONUS : 0;

    return engagementScore * decay + affinityBonus + liveRoomBonus;
};

// Ranks a list of posts (each already carrying commentCount/liveDiscussion,
// same shape getAllPosts attaches) for one viewer. `connectionUserIds` is a
// Set of stringified user ids the viewer is connected to (accepted, either
// direction) - membership check is O(1) per post rather than re-querying per
// post. Returns posts sorted best-first, each annotated with the score that
// produced its position (handy for debugging/tests, harmless for consumers
// that just render the posts in order).
export const rankPosts = (posts, connectionUserIds = new Set(), { now = new Date() } = {}) =>
    posts
        .map((post) => {
            const authorId = (post.userId?._id || post.userId)?.toString();
            const isConnection = Boolean(authorId && connectionUserIds.has(authorId));
            return { post, score: scorePost(post, { isConnection, now }) };
        })
        .sort((a, b) => b.score - a.score)
        .map(({ post, score }) => ({ ...post, feedScore: score }));

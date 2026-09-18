
export const HALF_LIFE_HOURS = 24;

export const ENGAGEMENT_WEIGHTS = {
    like: 1,
    reaction: 2,
    comment: 4,
};


export const AFFINITY_BONUS = 6; // author is one of the viewer's accepted connections
export const LIVE_ROOM_BONUS = 8; // post has a discussion room that's live right now

// Below this, decay is clamped rather than left to keep shrinking. Without a
// floor, a post more than a couple weeks old (many half-lives out) decays so
// close to literal 0 that multiplying it by engagementScore erases the
// engagement signal entirely - a post with 20 comments and a post with 0
// comments both round to "basically nothing" once old enough, so the only
// thing still distinguishing them is the flat affinity/live bonus. The floor
// guarantees engagement always contributes *something*, at every age, so two
// old posts with different engagement still rank differently - fresh posts
// still win overall, decay just stops being able to fully erase the rest.
export const MIN_DECAY = 0.05;

export const recencyDecay = (ageInHours, halfLifeHours = HALF_LIFE_HOURS) => {
    const age = Number.isFinite(ageInHours) ? Math.max(0, ageInHours) : 0;
    return Math.max(MIN_DECAY, Math.pow(0.5, age / halfLifeHours));
};

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

export const rankPosts = (posts, connectionUserIds = new Set(), { now = new Date() } = {}) =>
    posts
        .map((post) => {
            const authorId = (post.userId?._id || post.userId)?.toString();
            const isConnection = Boolean(authorId && connectionUserIds.has(authorId));
            return { post, score: scorePost(post, { isConnection, now }) };
        })
        .sort((a, b) => b.score - a.score)
        .map(({ post, score }) => ({ ...post, feedScore: score }));

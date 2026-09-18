// Standalone sanity check for the feed-ranking scoring function - pure math,
// no database needed. Run with: node backend/scripts/test-feed-ranking.mjs
import {
    recencyDecay,
    scorePost,
    rankPosts,
    HALF_LIFE_HOURS,
    MIN_DECAY,
} from "../services/feedRanking.service.js";

let passed = 0;
let failed = 0;

const check = (label, condition) => {
    if (condition) {
        passed += 1;
        console.log(`  ok  - ${label}`);
    } else {
        failed += 1;
        console.error(`  FAIL - ${label}`);
    }
};

const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000);
const post = (overrides = {}) => ({
    _id: overrides._id || Math.random().toString(36).slice(2),
    userId: overrides.userId || "author",
    createdAt: overrides.createdAt || new Date(),
    likedBy: overrides.likedBy || [],
    faceReactions: overrides.faceReactions || [],
    commentCount: overrides.commentCount || 0,
    liveDiscussion: overrides.liveDiscussion || null,
});

console.log("1) decay math");
check("decay(0) is 1 (no age, no fade)", recencyDecay(0) === 1);
check(
    `decay(${HALF_LIFE_HOURS}) is ~0.5 (one half-life)`,
    Math.abs(recencyDecay(HALF_LIFE_HOURS) - 0.5) < 1e-9
);
check(
    "decay is monotonically decreasing with age",
    recencyDecay(1) > recencyDecay(10) && recencyDecay(10) > recencyDecay(100)
);

console.log("2) recency ordering (equal, zero engagement)");
{
    const fresh = post({ createdAt: hoursAgo(1) });
    const stale = post({ createdAt: hoursAgo(48) });
    check(
        "a newer post outranks an older post with identical (zero) engagement",
        scorePost(fresh) > scorePost(stale)
    );
}

console.log("3) engagement can beat raw recency");
{
    const veryFreshEmpty = post({ createdAt: hoursAgo(0.05) });
    const olderPopular = post({
        createdAt: hoursAgo(6),
        likedBy: Array.from({ length: 40 }, (_, i) => `u${i}`),
        commentCount: 10,
    });
    check(
        "a 6h-old popular post outranks a brand-new post with zero engagement",
        scorePost(olderPopular) > scorePost(veryFreshEmpty)
    );
}

console.log("4) comments outweigh likes at the same age");
{
    const likedALot = post({ createdAt: hoursAgo(2), likedBy: Array.from({ length: 8 }, (_, i) => `u${i}`) });
    const commentedOnALittle = post({ createdAt: hoursAgo(2), commentCount: 3 });
    check(
        "3 comments outscore 8 likes (comment weight > like weight)",
        scorePost(commentedOnALittle) > scorePost(likedALot)
    );
}

console.log("5) connection affinity boost");
{
    const same = post({ createdAt: hoursAgo(3), likedBy: ["a", "b"] });
    check(
        "a connection's post outranks an identical stranger's post",
        scorePost(same, { isConnection: true }) > scorePost(same, { isConnection: false })
    );
}

console.log("6) live-room boost");
{
    const live = post({ createdAt: hoursAgo(3), liveDiscussion: { title: "Q&A" } });
    const notLive = post({ createdAt: hoursAgo(3) });
    check(
        "a post with an active live room outranks the same post without one",
        scorePost(live) > scorePost(notLive)
    );
}

console.log("7) rankPosts sorts best-first and preserves posts");
{
    const a = post({ _id: "a", createdAt: hoursAgo(50) }); // old, empty
    const b = post({ _id: "b", createdAt: hoursAgo(1), commentCount: 5 }); // fresh, popular
    const c = post({ _id: "c", createdAt: hoursAgo(1) }); // fresh, empty
    const ranked = rankPosts([a, b, c], new Set());
    check("returns all input posts", ranked.length === 3);
    check("best post (fresh + popular) sorts first", ranked[0]._id === "b");
    check("worst post (old + empty) sorts last", ranked[2]._id === "a");
    check("each ranked post carries its feedScore", typeof ranked[0].feedScore === "number");
}

console.log("8) decay floor - engagement still matters for very old posts");
{
    // Regression test for a real bug: without a floor, two 1000+ hour-old
    // posts both decay so close to zero that their engagement score gets
    // multiplied away to nothing, and they end up scoring identically
    // (just the flat affinity bonus) regardless of how different their
    // engagement actually was - the exact "why is a 3-comment post not
    // beating a 1-comment post" report that caught this.
    const oldQuiet = post({ createdAt: hoursAgo(1160), likedBy: ["a", "b"], commentCount: 1 });
    const oldPopular = post({ createdAt: hoursAgo(1646), likedBy: ["a", "b"], commentCount: 3 });
    check(
        "decay never drops below MIN_DECAY, even far past many half-lives",
        recencyDecay(5000) === MIN_DECAY
    );
    check(
        "an old post with more comments still outranks an old post with fewer, post-floor",
        scorePost(oldPopular, { isConnection: true }) > scorePost(oldQuiet, { isConnection: true })
    );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

import Block from "../models/block.model.js";

const asIdStrings = (rows, field) => rows.map((row) => row[field].toString());

// Everyone whose content should be hidden from `userId`:
//   - people they blocked, and people who blocked them (a block is mutual)
//   - people they muted (one-sided)
// `blocked` is the subset that also must not be able to contact them.
export const getHiddenUsers = async (userId) => {
    const rows = await Block.find({
        $or: [
            { blockerId: userId },
            { blockedId: userId, kind: "block" },
        ],
    })
        .select("blockerId blockedId kind")
        .lean();

    const blocked = new Set();
    const muted = new Set();
    for (const row of rows) {
        const mine = row.blockerId.toString() === userId.toString();
        const other = (mine ? row.blockedId : row.blockerId).toString();
        if (row.kind === "block") blocked.add(other);
        else if (mine) muted.add(other);
    }

    return {
        blocked: [...blocked],
        muted: [...muted],
        // For `{ userId: { $nin: hidden } }` style filters.
        hidden: [...new Set([...blocked, ...muted])],
    };
};

// True when either person has blocked the other.
export const isBlockedBetween = async (userA, userB) => {
    const row = await Block.exists({
        kind: "block",
        $or: [
            { blockerId: userA, blockedId: userB },
            { blockerId: userB, blockedId: userA },
        ],
    });
    return Boolean(row);
};

// A repost shows the original post inside it, so hiding a person's own posts is
// not enough: it must also disappear where someone else re-shared it. Drops a
// repost when its original's author is hidden from the viewer (blocked or
// muted), or the original has itself been hidden by a moderator (active: false).
// Ordinary posts, and reposts whose original is fine, are left alone.
export const dropHiddenReposts = (posts, hiddenIds) => {
    const hidden = new Set((hiddenIds || []).map(String));
    return posts.filter((post) => {
        const original = post.repostOf;
        if (!original || typeof original !== "object") return true;
        if (original.active === false) return false;
        const authorId = (original.userId?._id || original.userId)?.toString();
        return !(authorId && hidden.has(authorId));
    });
};

export { asIdStrings };

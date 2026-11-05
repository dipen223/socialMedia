// Drives the real block / mute / report code with stubbed models - no
// database, no network. Run with:  node backend/scripts/test-safety.mjs
process.env.JWT_SECRET_KEY ||= "test";
process.env.CLOUDINARY_CLOUD_NAME ||= "test";
process.env.CLOUDINARY_API_KEY ||= "test";
process.env.CLOUDINARY_API_SECRET ||= "test";
process.env.OPENAI_API_KEY ||= "test";

const { default: Block } = await import("../models/block.model.js");
const { default: Report } = await import("../models/report.model.js");
const { default: Connection } = await import("../models/connections.model.js");
const { default: User } = await import("../models/user.model.js");
const { default: Post } = await import("../models/posts.model.js");
const { default: Comment } = await import("../models/comments.model.js");
const { default: Conversation } = await import("../models/conversations.model.js");
const { default: Profile } = await import("../models/profile.model.js");
const { default: Message } = await import("../models/messages.model.js");
const { default: DiscussionRoom } = await import("../models/discussionRoom.model.js");
const { getHiddenUsers, isBlockedBetween, dropHiddenReposts } = await import("../services/safety.service.js");
const { default: safety } = await import("../controllers/safety.controller.js");
const { default: postsController } = await import("../controllers/posts.controller.js");
const { default: reelsController } = await import("../controllers/reels.controller.js");
const { default: commentsController } = await import("../controllers/comments.controller.js");
const { default: userController } = await import("../controllers/user.controller.js");
const { default: connectionController } = await import("../controllers/connection.controller.js");
const { default: messageController } = await import("../controllers/message.controller.js");
const { default: registerCallHandlers } = await import("../sockets/call.socket.js");

let failed = 0;
const check = (label, condition) => {
    if (condition) console.log(`  ok  - ${label}`);
    else {
        failed += 1;
        console.error(`  FAIL - ${label}`);
    }
};

const ME = "aaaaaaaaaaaaaaaaaaaaaaaa";
const BLOCKED_BY_ME = "bbbbbbbbbbbbbbbbbbbbbbbb";
const BLOCKED_ME = "cccccccccccccccccccccccc";
const MUTED_BY_ME = "dddddddddddddddddddddddd";
const STRANGER = "eeeeeeeeeeeeeeeeeeeeeeee";

const mkRes = () => {
    const res = { statusCode: 200, body: undefined };
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (body) => {
        res.body = body;
        return res;
    };
    res.send = res.json;
    return res;
};
const call = async (handler, { params = {}, body = {}, query = {}, user = ME } = {}) => {
    const res = mkRes();
    await handler({ params, body, query, user: { id: user } }, res);
    return res;
};

// A chainable stand-in for a mongoose query: records the filter, ignores the
// populate/sort/limit calls, and resolves to `result`.
const chain = (result, capture) => {
    const q = {
        select: () => q,
        sort: () => q,
        limit: () => q,
        populate: () => q,
        lean: async () => result,
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    return (filter) => {
        capture?.(filter);
        return q;
    };
};

// ---- stubs -----------------------------------------------------------------
let blockRows = [];
let blockExists = false;
const writes = { updateOne: [], deleteOne: [], connectionDelete: [], reports: [] };
Block.find = chain(blockRows);
Block.find = (filter) => chain(blockRows)(filter);
Block.exists = async () => (blockExists ? { _id: 1 } : null);
Block.findOne = async () => existingBlock;
let existingBlock = null;
Block.updateOne = async (...args) => writes.updateOne.push(args);
Block.deleteOne = async (...args) => writes.deleteOne.push(args);
Connection.deleteMany = async (...args) => writes.connectionDelete.push(args);
Connection.findOne = async () => null;
User.findById = (id) => {
    const exists = id !== "ffffffffffffffffffffffff";
    const doc = exists ? { _id: id } : null;
    const q = { select: () => q, then: (r, j) => Promise.resolve(doc).then(r, j) };
    return q;
};

// ---- getHiddenUsers --------------------------------------------------------
console.log("getHiddenUsers");
blockRows = [
    { blockerId: ME, blockedId: BLOCKED_BY_ME, kind: "block" },
    { blockerId: BLOCKED_ME, blockedId: ME, kind: "block" },
    { blockerId: ME, blockedId: MUTED_BY_ME, kind: "mute" },
    // someone else muting me is none of my business and must not hide them
    { blockerId: STRANGER, blockedId: ME, kind: "mute" },
];
const hidden = await getHiddenUsers(ME);
check("people I blocked are hidden and blocked", hidden.blocked.includes(BLOCKED_BY_ME));
check("people who blocked me are hidden and blocked", hidden.blocked.includes(BLOCKED_ME));
check("people I muted are hidden but not blocked", hidden.muted.includes(MUTED_BY_ME) && !hidden.blocked.includes(MUTED_BY_ME));
check("someone who muted me is not hidden", !hidden.hidden.includes(STRANGER));
check("hidden is the union", hidden.hidden.length === 3);

console.log("isBlockedBetween");
blockExists = true;
check("true when a block row exists", await isBlockedBetween(ME, BLOCKED_ME));
blockExists = false;
check("false otherwise", !(await isBlockedBetween(ME, STRANGER)));

// ---- block / mute controllers ---------------------------------------------
console.log("block");
let res = await call(safety.blockUser, { params: { userId: BLOCKED_BY_ME } });
check("blocking succeeds", res.statusCode === 200 && res.body.kind === "block");
check("it upserts a block row", writes.updateOne.at(-1)[1].$set.kind === "block");
check("it ends any connection either way", writes.connectionDelete.length === 1);
res = await call(safety.blockUser, { params: { userId: ME } });
check("you can't block yourself", res.statusCode === 400);
res = await call(safety.blockUser, { params: { userId: "not-an-id" } });
check("an invalid id is rejected", res.statusCode === 400);
res = await call(safety.blockUser, { params: { userId: "ffffffffffffffffffffffff" } });
check("a missing user is a 404", res.statusCode === 404);

console.log("mute");
const connBefore = writes.connectionDelete.length;
res = await call(safety.muteUser, { params: { userId: MUTED_BY_ME } });
check("muting succeeds", res.statusCode === 200 && res.body.kind === "mute");
check("muting keeps the connection", writes.connectionDelete.length === connBefore);
existingBlock = { kind: "block" };
const updatesBefore = writes.updateOne.length;
res = await call(safety.muteUser, { params: { userId: BLOCKED_BY_ME } });
check("a mute never weakens an existing block", res.body.kind === "block" && writes.updateOne.length === updatesBefore);
existingBlock = null;

console.log("unblock / unmute");
await call(safety.unblockUser, { params: { userId: BLOCKED_BY_ME } });
check("unblock removes only the block", writes.deleteOne.at(-1)[0].kind === "block");
await call(safety.unmuteUser, { params: { userId: MUTED_BY_ME } });
check("unmute removes only the mute", writes.deleteOne.at(-1)[0].kind === "mute");

// ---- reports ---------------------------------------------------------------
console.log("reports");
Post.findOne = (filter) => {
    const q = { select: () => q, then: (r, j) => Promise.resolve(filter._id === "111111111111111111111111" ? { userId: STRANGER } : filter._id === "222222222222222222222222" ? { userId: ME } : null).then(r, j) };
    return q;
};
Comment.findById = () => {
    const q = { select: () => q, then: (r, j) => Promise.resolve({ userId: STRANGER }).then(r, j) };
    return q;
};
let reportError = null;
Report.create = async (doc) => {
    if (reportError) throw reportError;
    writes.reports.push(doc);
};
res = await call(safety.createReport, { body: { targetType: "post", targetId: "111111111111111111111111", reason: "spam", details: "  ads  " } });
check("a valid report is accepted", res.statusCode === 201 && writes.reports.length === 1);
check("it records who is responsible and trims details", String(writes.reports[0].targetUserId) === STRANGER && writes.reports[0].details === "ads");
res = await call(safety.createReport, { body: { targetType: "comment", targetId: "111111111111111111111111", reason: "harassment" } });
check("comments can be reported", res.statusCode === 201);
res = await call(safety.createReport, { body: { targetType: "user", targetId: STRANGER, reason: "scam" } });
check("users can be reported", res.statusCode === 201);
res = await call(safety.createReport, { body: { targetType: "post", targetId: "111111111111111111111111", reason: "nope" } });
check("an unknown reason is rejected", res.statusCode === 400);
res = await call(safety.createReport, { body: { targetType: "thing", targetId: "111111111111111111111111", reason: "spam" } });
check("an unknown target type is rejected", res.statusCode === 400);
res = await call(safety.createReport, { body: { targetType: "post", targetId: "222222222222222222222222", reason: "spam" } });
check("you can't report your own post", res.statusCode === 400);
res = await call(safety.createReport, { body: { targetType: "post", targetId: "333333333333333333333333", reason: "spam" } });
check("reporting deleted content is a 404", res.statusCode === 404);
reportError = { code: 11000 };
res = await call(safety.createReport, { body: { targetType: "post", targetId: "111111111111111111111111", reason: "spam" } });
check("reporting the same thing twice is harmless", res.statusCode === 201);
reportError = null;

// ---- enforcement -----------------------------------------------------------
console.log("feeds and search hide blocked/muted people");
blockRows = [
    { blockerId: ME, blockedId: BLOCKED_BY_ME, kind: "block" },
    { blockerId: ME, blockedId: MUTED_BY_ME, kind: "mute" },
];
const expectHidden = (filter) =>
    filter?.userId?.$nin?.includes(BLOCKED_BY_ME) && filter.userId.$nin.includes(MUTED_BY_ME);

let postFilter;
Post.find = chain([], (filter) => {
    postFilter = filter;
});
Comment.aggregate = async () => [];
DiscussionRoom.find = chain([]);
Connection.find = chain([]);
await call(postsController.getFeed);
check("/feed excludes them", expectHidden(postFilter));
await call(postsController.getAllPosts);
check("/allPosts excludes them", expectHidden(postFilter));
await call(postsController.getPostsByHashtag, { params: { tag: "food" } });
check("hashtag pages exclude them", expectHidden(postFilter));
await call(reelsController.getReels);
check("reels excludes them", expectHidden(postFilter));

let commentFilter;
Post.findById = async () => ({ _id: "p" });
Comment.find = chain([], (filter) => {
    commentFilter = filter;
});
await call(commentsController.getCommentsByPost, { params: { postId: "111111111111111111111111" } });
check("comments exclude them", expectHidden(commentFilter));

let userFilter;
User.find = chain([], (filter) => {
    userFilter = filter;
});
await call(userController.searchPeople, { query: { q: "alex" } });
check("search hides people who blocked me or I blocked (but not mutes)", userFilter?._id?.$nin?.includes(BLOCKED_BY_ME) && !userFilter._id.$nin.includes(MUTED_BY_ME));

let profileFilter;
Profile.find = chain([{ _id: "p" }], (filter) => {
    profileFilter = filter;
});
await call(userController.getAllUserProfile);
check("the people-discovery list hides blocked people (not mutes)", profileFilter?.userId?.$nin?.includes(BLOCKED_BY_ME) && !profileFilter.userId.$nin.includes(MUTED_BY_ME));

console.log("reposts of hidden people");
const own = { _id: "own", userId: STRANGER, repostOf: null, body: "plain post" };
const repostOfBlocked = { _id: "r1", userId: STRANGER, repostOf: { _id: "o1", userId: { _id: BLOCKED_BY_ME }, active: true } };
const repostOfMuted = { _id: "r2", userId: STRANGER, repostOf: { _id: "o2", userId: MUTED_BY_ME, active: true } };
const repostOfModerated = { _id: "r3", userId: STRANGER, repostOf: { _id: "o3", userId: { _id: STRANGER }, active: false } };
const repostFine = { _id: "r4", userId: STRANGER, repostOf: { _id: "o4", userId: { _id: STRANGER }, active: true } };
const repostBroken = { _id: "r5", userId: STRANGER, repostOf: "aaaaaaaaaaaaaaaaaaaaaaaa" };
const kept = dropHiddenReposts([own, repostOfBlocked, repostOfMuted, repostOfModerated, repostFine, repostBroken], [BLOCKED_BY_ME, MUTED_BY_ME]).map((p) => p._id);
check("a repost of a blocked person's post is dropped (populated author)", !kept.includes("r1"));
check("a repost of a muted person's post is dropped (author as a plain id)", !kept.includes("r2"));
check("a repost of a moderator-hidden post is dropped", !kept.includes("r3"));
check("ordinary posts and fine reposts are kept", kept.includes("own") && kept.includes("r4"));
check("an unpopulated repost reference is left alone, not crashed on", kept.includes("r5"));
check("handles no hidden list", dropHiddenReposts([repostOfBlocked], undefined).length === 1);

let feedResult = [own, repostOfBlocked, repostFine];
Post.find = chain(feedResult);
Comment.aggregate = async () => [];
DiscussionRoom.find = chain([]);
Connection.find = chain([]);
blockRows = [{ blockerId: ME, blockedId: BLOCKED_BY_ME, kind: "block" }];
for (const [label, handler, opts] of [
    ["/allPosts", postsController.getAllPosts, {}],
    ["/feed", postsController.getFeed, {}],
    ["hashtag pages", postsController.getPostsByHashtag, { params: { tag: "food" } }],
    ["saved posts", postsController.getSavedPosts, {}],
]) {
    const r = await call(handler, opts);
    const ids = (r.body?.posts || []).map((post) => post._id);
    check(`${label} drops the repost of a blocked person's post but keeps the rest`, r.statusCode === 200 && !ids.includes("r1") && ids.includes("own") && ids.includes("r4"));
}

let savedFilter;
Post.find = chain([], (filter) => {
    savedFilter = filter;
});
await call(postsController.getSavedPosts);
check("saved posts by a blocked or muted author are hidden too", savedFilter?.userId?.$nin?.includes(BLOCKED_BY_ME));

console.log("reposting");
Post.findOne = () => ({ then: (r, j) => Promise.resolve({ _id: "orig", userId: BLOCKED_ME, repostOf: null }).then(r, j) });
let repostCreated = false;
Post.create = async () => {
    repostCreated = true;
    return { _id: "new" };
};
blockExists = true;
res = await call(postsController.repostPost, { params: { postId: "111111111111111111111111" }, body: {} });
check("you can't repost a blocked person's post, and it looks like it doesn't exist", res.statusCode === 404 && !repostCreated);
blockExists = false;

console.log("contact is refused");
blockExists = true;
res = await call(connectionController.sendConnectionRequest, { body: { recipientId: BLOCKED_ME } });
check("a connection request to/from a blocked person is refused", res.statusCode === 403);
blockExists = false;

let messageCreated = false;
Conversation.findOne = () => {
    const q = { select: () => q, then: (r, j) => Promise.resolve({ _id: "c1", members: [ME, BLOCKED_ME] }).then(r, j) };
    return q;
};
Message.create = async () => {
    messageCreated = true;
    throw new Error("should not be reached");
};
blockExists = true;
res = await call(messageController.sendMessage, { params: { conversationId: "111111111111111111111111" }, body: { body: "hi" } });
check("a message to a blocked person is refused", res.statusCode === 403 && res.body.code === "MESSAGE_BLOCKED" && !messageCreated);
blockExists = false;

// call invites
const handlers = {};
const sock = {
    id: "s1",
    user: { id: ME },
    on: (event, fn) => {
        handlers[event] = fn;
    },
    to: () => ({ emit: () => {} }),
    emit: () => {},
};
registerCallHandlers({ io: { sockets: { adapter: { rooms: new Map([[`user:${BLOCKED_ME}`, new Set(["x"])]]) } }, to: () => ({ emit: () => {} }) }, socket: sock });
Conversation.findOne = () => ({ populate: () => ({ lean: async () => ({ _id: "c1", members: [{ _id: ME }, { _id: BLOCKED_ME }] }) }) });
blockExists = true;
let ack;
await handlers["call:invite"]({ conversationId: "c1", targetUserId: BLOCKED_ME, mode: "audio" }, (r) => {
    ack = r;
});
check("a call to a blocked person is refused", ack?.ok === false);
blockExists = false;
await handlers["call:invite"]({ conversationId: "c1", targetUserId: BLOCKED_ME, mode: "audio" }, (r) => {
    ack = r;
});
check("and allowed again once they're not blocked", ack?.ok === true);

if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
}
console.log("\nall passed");
process.exit(0);

// Drives the real admin guard and report-review code with stubbed models - no
// database, no network. Run with:  node backend/scripts/test-admin.mjs
process.env.JWT_SECRET_KEY ||= "test";

const { default: User } = await import("../models/user.model.js");
const { default: Report } = await import("../models/report.model.js");
const { default: Post } = await import("../models/posts.model.js");
const { default: Comment } = await import("../models/comments.model.js");
const { default: requireAdmin } = await import("../middlewares/admin.js");
const { default: admin } = await import("../controllers/admin.controller.js");
const { default: adminRouter } = await import("../routes/admin.router.js");

let failed = 0;
const check = (label, condition) => {
    if (condition) console.log(`  ok  - ${label}`);
    else {
        failed += 1;
        console.error(`  FAIL - ${label}`);
    }
};

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
    return res;
};
const run = async (handler, { params = {}, body = {}, query = {}, user = "admin1" } = {}) => {
    const res = mkRes();
    await handler({ params, body, query, user: { id: user } }, res);
    return res;
};
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

// ---- requireAdmin ----------------------------------------------------------
console.log("requireAdmin");
const roles = { admin1: "admin", user1: "user" };
User.findById = (id) => chain(roles[id] ? { role: roles[id] } : null)();
const guard = async (userId) => {
    const res = mkRes();
    let nextCalled = false;
    await requireAdmin({ user: { id: userId } }, res, () => {
        nextCalled = true;
    });
    return { res, nextCalled };
};
let out = await guard("admin1");
check("an admin is let through", out.nextCalled && out.res.statusCode === 200);
out = await guard("user1");
check("a normal user gets 403 and never reaches the handler", !out.nextCalled && out.res.statusCode === 403);
out = await guard("ghost");
check("an unknown user gets 403", !out.nextCalled && out.res.statusCode === 403);
User.findById = () => {
    throw new Error("db down");
};
out = await guard("admin1");
check("a database error fails closed (500, not through)", !out.nextCalled && out.res.statusCode === 500);
User.findById = (id) => chain(roles[id] ? { role: roles[id] } : null)();

console.log("routes are guarded");
const adminRoutes = adminRouter.stack.filter((layer) => layer.route);
const dataRoutes = adminRoutes.filter((layer) => layer.route.path !== "/admin/me");
check("there are 3 admin routes", adminRoutes.length === 3);
check(
    "both data routes run requireAdmin before their handler",
    dataRoutes.length === 2 && dataRoutes.every((layer) => layer.route.stack.some((s) => s.handle === requireAdmin))
);

console.log("getAdminStatus");
let statusRes = await run(admin.getAdminStatus, { user: "admin1" });
check("an admin is told yes", statusRes.statusCode === 200 && statusRes.body.isAdmin === true);
statusRes = await run(admin.getAdminStatus, { user: "user1" });
check("a normal user is told no (not an error)", statusRes.statusCode === 200 && statusRes.body.isAdmin === false);
statusRes = await run(admin.getAdminStatus, { user: "ghost" });
check("an unknown user is told no", statusRes.statusCode === 200 && statusRes.body.isAdmin === false);

// ---- listReports -----------------------------------------------------------
console.log("listReports");
const U = (id, name) => ({ _id: id, name, username: name.toLowerCase() });
const reports = [
    { _id: "r3", targetType: "post", targetId: "post1", reason: "spam", details: "ads", status: "open", createdAt: 3, reporterId: U("u1", "Ann"), targetUserId: U("t1", "Bob") },
    { _id: "r2", targetType: "comment", targetId: "c1", reason: "harassment", details: "", status: "open", createdAt: 2, reporterId: U("u2", "Cy"), targetUserId: U("t1", "Bob") },
    { _id: "r1", targetType: "post", targetId: "gone", reason: "scam", details: "", status: "open", createdAt: 1, reporterId: U("u1", "Ann"), targetUserId: U("t2", "Di") },
];
let reportFilter;
Report.find = chain(reports, (filter) => {
    reportFilter = filter;
});
Report.countDocuments = async () => 7;
Report.aggregate = async () => [
    { _id: "t1", count: 5 },
    { _id: "t2", count: 1 },
];
Post.find = chain([{ _id: "post1", body: "buy now", media: "x.jpg", fileType: "image/jpeg", active: false }]);
Comment.find = chain([{ _id: "c1", body: "you are awful" }]);

let res = await run(admin.listReports);
check("defaults to open reports", reportFilter.status === "open");
check("returns each report with reporter and reported user", res.body.reports[0].reporter.name === "Ann" && res.body.reports[0].targetUser.name === "Bob");
check("attaches the reported post, including whether it is hidden", res.body.reports[0].content.kind === "post" && res.body.reports[0].content.body === "buy now" && res.body.reports[0].content.hidden === true);
check("attaches the reported comment", res.body.reports[1].content.kind === "comment" && res.body.reports[1].content.body === "you are awful");
check("content that was deleted comes back as null, not an error", res.body.reports[2].content === null);
check("shows how many reports the person has drawn", res.body.reports[0].reportsAgainstUser === 5 && res.body.reports[2].reportsAgainstUser === 1);
check("returns the open count for a badge", res.body.openCount === 7);
res = await run(admin.listReports, { query: { limit: "3" } });
check("gives a cursor when a full page came back", res.body.nextCursor === "r1");
res = await run(admin.listReports, { query: { limit: "50" } });
check("no cursor on a short page", res.body.nextCursor === null);
res = await run(admin.listReports, { query: { status: "all" } });
check("status=all applies no status filter", reportFilter.status === undefined);
res = await run(admin.listReports, { query: { status: "bogus" } });
check("an unknown status is rejected", res.statusCode === 400);
res = await run(admin.listReports, { query: { before: "nope" } });
check("a bad cursor is rejected", res.statusCode === 400);
await run(admin.listReports, { query: { before: "aaaaaaaaaaaaaaaaaaaaaaaa" } });
check("a valid cursor pages backwards by id", reportFilter._id?.$lt === "aaaaaaaaaaaaaaaaaaaaaaaa");

// ---- updateReport ----------------------------------------------------------
console.log("updateReport");
const RID = "111111111111111111111111";
let saved = null;
const postUpdates = [];
let stored = null;
Report.findById = async () => stored;
Post.updateOne = async (...args) => postUpdates.push(args);
const mkReport = (targetType) => ({
    targetType,
    targetId: "222222222222222222222222",
    status: "open",
    async save() {
        saved = { status: this.status, reviewedBy: this.reviewedBy, reviewedAt: this.reviewedAt };
    },
});

stored = mkReport("post");
res = await run(admin.updateReport, { params: { reportId: RID }, body: { status: "dismissed" } });
check("dismissing works and records who and when", res.statusCode === 200 && saved.status === "dismissed" && saved.reviewedBy === "admin1" && saved.reviewedAt instanceof Date);
check("dismissing does not touch the post", postUpdates.length === 0);

stored = mkReport("post");
res = await run(admin.updateReport, { params: { reportId: RID }, body: { status: "reviewed", contentAction: "hide" } });
check("hiding a post sets it inactive (soft, reversible)", postUpdates.at(-1)[1].$set.active === false && saved.status === "reviewed");
stored = mkReport("post");
await run(admin.updateReport, { params: { reportId: RID }, body: { status: "reviewed", contentAction: "restore" } });
check("restoring sets it active again", postUpdates.at(-1)[1].$set.active === true);

stored = mkReport("post");
await run(admin.updateReport, { params: { reportId: RID }, body: { status: "open" } });
check("reopening clears the reviewer", saved.status === "open" && saved.reviewedBy === null && saved.reviewedAt === null);

const updatesBefore = postUpdates.length;
stored = mkReport("comment");
res = await run(admin.updateReport, { params: { reportId: RID }, body: { status: "reviewed", contentAction: "hide" } });
check("only posts can be hidden", res.statusCode === 400 && postUpdates.length === updatesBefore);
res = await run(admin.updateReport, { params: { reportId: "bad" }, body: { status: "reviewed" } });
check("a bad report id is rejected", res.statusCode === 400);
res = await run(admin.updateReport, { params: { reportId: RID }, body: { status: "deleted" } });
check("an unknown status is rejected", res.statusCode === 400);
res = await run(admin.updateReport, { params: { reportId: RID }, body: { status: "reviewed", contentAction: "nuke" } });
check("an unknown action is rejected", res.statusCode === 400);
stored = null;
res = await run(admin.updateReport, { params: { reportId: RID }, body: { status: "reviewed" } });
check("a missing report is a 404", res.statusCode === 404);

if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
}
console.log("\nall passed");
process.exit(0);

import mongoose from "mongoose";
import Report, { REPORT_STATUSES } from "../models/report.model.js";
import Post from "../models/posts.model.js";
import Comment from "../models/comments.model.js";
import User from "../models/user.model.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// Only used to tell the frontend whether to show the admin link. It answers
// yes or no for anyone (so normal users don't see an error on every page);
// the data routes are protected by requireAdmin regardless of what the UI shows.
const getAdminStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("role");
        return res.status(200).json({ isAdmin: user?.role === "admin" });
    } catch (err) {
        console.error("Error checking admin status!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};

const summarisePost = (post) => ({
    kind: "post",
    body: post.body || "",
    media: post.media || "",
    fileType: post.fileType || "",
    hidden: post.active === false,
});

const listReports = async (req, res) => {
    const status = req.query.status === "all" ? null : req.query.status || "open";
    if (status && !REPORT_STATUSES.includes(status)) {
        return res.status(400).json({ message: "Invalid status." });
    }

    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
        : DEFAULT_LIMIT;

    const query = {};
    if (status) query.status = status;
    if (req.query.before) {
        if (!mongoose.isValidObjectId(req.query.before)) {
            return res.status(400).json({ message: "Invalid cursor." });
        }
        query._id = { $lt: req.query.before };
    }

    try {
        const reports = await Report.find(query)
            .sort({ _id: -1 })
            .limit(limit)
            .populate("reporterId", "name username")
            .populate("targetUserId", "name username profilePicture")
            .lean();

        // Look the reported content up in one query per type, not one per report.
        const idsOf = (type) =>
            reports.filter((report) => report.targetType === type).map((report) => report.targetId);
        const [posts, comments, counts, openCount] = await Promise.all([
            Post.find({ _id: { $in: idsOf("post") } }).select("body media fileType active").lean(),
            Comment.find({ _id: { $in: idsOf("comment") } }).select("body").lean(),
            // How many reports each person has drawn (any status), so repeat
            // offenders stand out at a glance.
            Report.aggregate([
                { $match: { targetUserId: { $in: reports.map((report) => report.targetUserId?._id || report.targetUserId) } } },
                { $group: { _id: "$targetUserId", count: { $sum: 1 } } },
            ]),
            Report.countDocuments({ status: "open" }),
        ]);

        const postById = new Map(posts.map((post) => [post._id.toString(), post]));
        const commentById = new Map(comments.map((comment) => [comment._id.toString(), comment]));
        const countByUser = new Map(counts.map((row) => [row._id.toString(), row.count]));

        const items = reports.map((report) => {
            let content = null;
            if (report.targetType === "post" && postById.has(report.targetId.toString())) {
                content = summarisePost(postById.get(report.targetId.toString()));
            } else if (report.targetType === "comment" && commentById.has(report.targetId.toString())) {
                content = { kind: "comment", body: commentById.get(report.targetId.toString()).body || "" };
            }
            const targetUserId = (report.targetUserId?._id || report.targetUserId)?.toString();
            return {
                _id: report._id,
                targetType: report.targetType,
                targetId: report.targetId,
                reason: report.reason,
                details: report.details,
                status: report.status,
                createdAt: report.createdAt,
                reviewedAt: report.reviewedAt,
                reporter: report.reporterId || null,
                targetUser: report.targetUserId || null,
                reportsAgainstUser: countByUser.get(targetUserId) || 1,
                // null when the content has since been deleted.
                content,
            };
        });

        const nextCursor = reports.length === limit ? reports[reports.length - 1]._id : null;
        return res.status(200).json({ reports: items, nextCursor, openCount });
    } catch (err) {
        console.error("Error listing reports!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};

const updateReport = async (req, res) => {
    const { reportId } = req.params;
    const { status, contentAction } = req.body;

    if (!mongoose.isValidObjectId(reportId)) {
        return res.status(400).json({ message: "Invalid report." });
    }
    if (!REPORT_STATUSES.includes(status)) {
        return res.status(400).json({ message: "Invalid status." });
    }
    if (contentAction !== undefined && !["hide", "restore"].includes(contentAction)) {
        return res.status(400).json({ message: "Invalid action." });
    }

    try {
        const report = await Report.findById(reportId);
        if (!report) {
            return res.status(404).json({ message: "Report not found." });
        }
        if (contentAction && report.targetType !== "post") {
            return res.status(400).json({ message: "Only posts can be hidden or restored." });
        }

        // Hiding is the soft `active: false` every feed already respects, so it
        // is fully reversible - nothing is deleted.
        if (contentAction) {
            await Post.updateOne(
                { _id: report.targetId },
                { $set: { active: contentAction === "restore" } }
            );
        }

        report.status = status;
        report.reviewedBy = status === "open" ? null : req.user.id;
        report.reviewedAt = status === "open" ? null : new Date();
        await report.save();

        return res.status(200).json({ message: "Report updated.", status: report.status });
    } catch (err) {
        console.error("Error updating report!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};

export default { getAdminStatus, listReports, updateReport };

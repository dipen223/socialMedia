import User from "../models/user.model.js";

// Runs after `auth`. The role is read from the database on every request, not
// from the token: a token stays valid for days, so trusting a claim in it would
// mean a demoted admin keeps their access until it expires.
const requireAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select("role");
        if (user?.role !== "admin") {
            return res.status(403).json({ message: "Admins only." });
        }
        return next();
    } catch (err) {
        console.error("Error checking admin role!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};

export default requireAdmin;

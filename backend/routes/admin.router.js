import express from "express";
import adminController from "../controllers/admin.controller.js";
import auth from "../middlewares/auth.js";
import requireAdmin from "../middlewares/admin.js";

const adminRouter = express.Router();

// Deliberately not behind requireAdmin - it only reports the caller's own status.
adminRouter.get("/admin/me", auth, adminController.getAdminStatus);
adminRouter.get("/admin/reports", auth, requireAdmin, adminController.listReports);
adminRouter.patch("/admin/reports/:reportId", auth, requireAdmin, adminController.updateReport);

export default adminRouter;

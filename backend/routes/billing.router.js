import express from "express";
import billingController from "../controllers/billing.controller.js";
import auth from "../middlewares/auth.js";

const billingRouter = express.Router();

billingRouter.post("/billing/checkout", auth, billingController.startCheckout);
billingRouter.post("/billing/portal", auth, billingController.openBillingPortal);
billingRouter.get("/billing/status", auth, billingController.getBillingStatus);

export default billingRouter;

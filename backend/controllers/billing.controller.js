import User from "../models/user.model.js";
import {
    createCheckoutSession,
    createPortalSession,
    constructWebhookEvent,
    getPlanForPriceId,
    retrieveSubscription,
    PLAN_LIMITS_SECONDS,
} from "../services/stripe.service.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const getBillingErrorResponse = (error, fallbackMessage) => {
    if (error.status === 503) return { status: 503, message: error.message };
    if (error.status === 400) return { status: 400, message: error.message };
    return { status: 500, message: fallbackMessage };
};

const startCheckout = async (req, res) => {
    const plan = req.body.plan === "plus" ? "plus" : null;
    const billing = req.body.billing === "annual" ? "annual" : "monthly";

    if (!plan) {
        return res.status(400).json({ message: "Choose a plan to subscribe to." });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "User not found." });

        const session = await createCheckoutSession({
            user,
            plan,
            billing,
            successUrl: `${FRONTEND_URL}/dashboard/pricing?checkout=success`,
            cancelUrl: `${FRONTEND_URL}/dashboard/pricing?checkout=cancelled`,
        });

        if (session.customer && session.customer !== user.stripeCustomerId) {
            user.stripeCustomerId = session.customer;
            await user.save();
        }

        return res.status(200).json({ url: session.url });
    } catch (error) {
        console.error("Could not start checkout:", error.message);
        const result = getBillingErrorResponse(error, "Could not start checkout right now.");
        return res.status(result.status).json({ message: result.message });
    }
};

const openBillingPortal = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "User not found." });

        const session = await createPortalSession({
            user,
            returnUrl: `${FRONTEND_URL}/dashboard/settings`,
        });

        return res.status(200).json({ url: session.url });
    } catch (error) {
        console.error("Could not open billing portal:", error.message);
        const result = getBillingErrorResponse(error, "Could not open billing management right now.");
        return res.status(result.status).json({ message: result.message });
    }
};

const getBillingStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "User not found." });

        return res.status(200).json({
            plan: user.plan,
            subscriptionStatus: user.subscriptionStatus,
            currentPeriodEnd: user.currentPeriodEnd,
            translationSecondsUsed: user.translationSecondsUsed,
            translationSecondsLimit: PLAN_LIMITS_SECONDS[user.plan],
            translationOverageMinutes: user.translationOverageMinutesReported,
        });
    } catch (error) {
        console.error("Could not load billing status:", error.message);
        return res.status(500).json({ message: "Could not load billing status." });
    }
};

// Stripe is the single source of truth for plan state - the webhook is the
// only place `plan`/`subscriptionStatus`/`currentPeriodEnd` are written.
// Checkout completing just attaches the subscription id; `subscription.updated`
// (which Stripe also fires right after checkout) is what actually sets the plan.
const applySubscriptionState = async (subscription) => {
    const userId = subscription.metadata?.userId;
    // A Plus subscription now carries two items - the flat base price and the
    // metered overage price - so the base item has to be found by matching a
    // known plan price id, not assumed to be items.data[0].
    const items = subscription.items?.data || [];
    const baseItem = items.find((item) => getPlanForPriceId(item.price?.id));
    const plan = getPlanForPriceId(baseItem?.price?.id);
    if (!userId || !plan) return;

    const user = await User.findById(userId);
    if (!user) return;

    const isActive = ["active", "trialing"].includes(subscription.status);
    // Recent Stripe API versions moved current_period_end off the subscription
    // itself onto each subscription item (a subscription can hold multiple
    // items, each on its own billing clock, e.g. the base item renews yearly
    // while the metered overage item bills monthly) - read the base item's
    // own period end, falling back to the subscription-level field for older
    // API shapes.
    const periodEndSeconds = baseItem?.current_period_end ?? subscription.current_period_end;
    const newPeriodEnd = periodEndSeconds ? new Date(periodEndSeconds * 1000) : null;
    const previousPeriodEnd = user.currentPeriodEnd;
    const isNewCycle =
        !previousPeriodEnd ||
        !newPeriodEnd ||
        newPeriodEnd.getTime() !== previousPeriodEnd.getTime();

    user.stripeSubscriptionId = subscription.id;
    user.subscriptionStatus = subscription.status;
    user.plan = isActive ? plan : "free";
    user.currentPeriodEnd = newPeriodEnd;
    if (isActive && isNewCycle) {
        // A fresh billing cycle (new subscription, renewal, or plan change) resets
        // the translated-minutes counter - minutes don't roll over, per the pricing page.
        user.translationSecondsUsed = 0;
        user.translationCycleStart = new Date();
        user.translationOverageMinutesReported = 0;
    }
    await user.save();
};

const handleSubscriptionDeleted = async (subscription) => {
    const userId = subscription.metadata?.userId;
    if (!userId) return;

    const user = await User.findById(userId);
    if (!user || user.stripeSubscriptionId !== subscription.id) return;

    user.plan = "free";
    user.subscriptionStatus = "canceled";
    user.stripeSubscriptionId = null;
    user.currentPeriodEnd = null;
    await user.save();
};

const handleWebhook = async (req, res) => {
    let event;
    try {
        event = constructWebhookEvent(req.body, req.headers["stripe-signature"]);
    } catch (error) {
        console.error("Stripe webhook signature verification failed:", error.message);
        return res.status(400).json({ message: "Invalid webhook signature." });
    }

    try {
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object;
                if (session.subscription) {
                    const subscription = await retrieveSubscription(session.subscription);
                    await applySubscriptionState(subscription);
                }
                break;
            }
            case "customer.subscription.updated":
            case "customer.subscription.created":
                await applySubscriptionState(event.data.object);
                break;
            case "customer.subscription.deleted":
                await handleSubscriptionDeleted(event.data.object);
                break;
            default:
                break;
        }
        return res.status(200).json({ received: true });
    } catch (error) {
        console.error(`Stripe webhook handler failed for ${event.type}:`, error.message);
        // Ack anyway - Stripe retries on non-2xx, and a handler bug shouldn't
        // cause it to hammer this endpoint indefinitely.
        return res.status(200).json({ received: true });
    }
};

export default { startCheckout, openBillingPortal, getBillingStatus, handleWebhook };

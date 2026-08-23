import Stripe from "stripe";

let stripeClient = null;
const getStripe = () => {
    if (!process.env.STRIPE_SECRET_KEY) {
        const error = new Error("Billing is not configured yet.");
        error.status = 503;
        throw error;
    }
    if (!stripeClient) {
        stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
    return stripeClient;
};

// Free has no Stripe price - it's just the absence of a subscription. Plus is
// the only paid tier: a flat monthly/annual base price plus a metered overage
// price (usage-based, no fixed cap) attached to the same subscription - there's
// no separate "Unlimited" plan because a flat price can't safely promise that.
const PRICE_IDS = {
    plus: {
        monthly: process.env.STRIPE_PRICE_PLUS_MONTHLY,
        annual: process.env.STRIPE_PRICE_PLUS_ANNUAL,
    },
};
const OVERAGE_PRICE_ID = process.env.STRIPE_PRICE_PLUS_OVERAGE;
const METER_EVENT_NAME = process.env.STRIPE_METER_EVENT_NAME || "translation_overage_minute";

// Minutes included before overage billing kicks in. Free gets none at all.
export const PLAN_LIMITS_SECONDS = {
    free: 0,
    plus: 200 * 60,
};

export const getPriceId = (plan, billing) => {
    return PRICE_IDS[plan]?.[billing] || null;
};

export const getPlanForPriceId = (priceId) => {
    for (const [plan, cadences] of Object.entries(PRICE_IDS)) {
        if (Object.values(cadences).includes(priceId)) return plan;
    }
    return null;
};

export const createCheckoutSession = async ({ user, plan, billing, successUrl, cancelUrl }) => {
    const stripe = getStripe();
    const priceId = getPriceId(plan, billing);
    if (!priceId) {
        const error = new Error("That plan is not available yet.");
        error.status = 400;
        throw error;
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
        const customer = await stripe.customers.create({
            email: user.email,
            name: user.name,
            metadata: { userId: user._id.toString() },
        });
        customerId = customer.id;
    }

    // A metered line item must NOT have a quantity - Stripe bills it purely
    // off reported usage, so quantity there would be a request-shape error.
    const lineItems = [{ price: priceId, quantity: 1 }];
    if (OVERAGE_PRICE_ID) lineItems.push({ price: OVERAGE_PRICE_ID });

    return stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: user._id.toString(),
        line_items: lineItems,
        success_url: successUrl,
        cancel_url: cancelUrl,
        subscription_data: {
            metadata: { userId: user._id.toString() },
        },
    });
};

// Reports minutes used beyond the included allowance to Stripe's usage meter,
// which bills them automatically at the end of the cycle via the metered
// overage price - the caller is responsible for only reporting the delta
// (never re-reporting minutes already sent) so nothing gets double-billed.
export const reportOverageUsage = async ({ customerId, minutes }) => {
    if (!minutes || minutes <= 0 || !customerId) return;
    const stripe = getStripe();
    await stripe.billing.meterEvents.create({
        event_name: METER_EVENT_NAME,
        payload: {
            stripe_customer_id: customerId,
            value: String(minutes),
        },
    });
};

export const createPortalSession = async ({ user, returnUrl }) => {
    const stripe = getStripe();
    if (!user.stripeCustomerId) {
        const error = new Error("You don't have a billing account yet.");
        error.status = 400;
        throw error;
    }

    return stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: returnUrl,
    });
};

export const constructWebhookEvent = (rawBody, signature) => {
    const stripe = getStripe();
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        const error = new Error("Webhook secret is not configured.");
        error.status = 503;
        throw error;
    }
    return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
};

export const retrieveSubscription = async (subscriptionId) => {
    const stripe = getStripe();
    return stripe.subscriptions.retrieve(subscriptionId);
};

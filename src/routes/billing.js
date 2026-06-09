// MeshWire Billing Routes -- Stripe Checkout, Customer Portal, Webhooks
import { Router } from "express";
import Stripe from "stripe";
import { getUserById, updateUserPlan, setStripeCustomerId } from "../db/users.js";
import { requireSessionAuth } from "./auth.js";

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2024-11-20.acacia" });
}

const BASE_URL =
  process.env.BASE_URL ||
  "https://meshwire.io";

// --- GET /upgrade -- Create Stripe Checkout session -> redirect ----------------
// Requires session auth (web dashboard flow).
router.get("/upgrade", requireSessionAuth, async (req, res, next) => {
  try {
    const stripe = getStripe();
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      return res.status(503).json({ error: "Billing not yet configured." });
    }

    if (req.user.plan === "pro") {
      // Already pro -- send to customer portal to manage subscription
      return res.redirect("/billing/portal");
    }

    const sessionParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/dashboard`,
      client_reference_id: req.user.user_id,
      customer_email: req.user.email || undefined,
      metadata: { user_id: req.user.user_id },
      subscription_data: {
        metadata: { user_id: req.user.user_id },
      },
    };

    // Re-use existing Stripe customer if we have one
    if (req.user.stripe_customer_id) {
      sessionParams.customer = req.user.stripe_customer_id;
      delete sessionParams.customer_email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.redirect(303, session.url);
  } catch (err) {
    next(err);
  }
});

// --- GET /billing/success -- Post-checkout landing ----------------------------
router.get("/success", requireSessionAuth, async (req, res, next) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.redirect("/dashboard");

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === "paid" || session.status === "complete") {
      // Ensure customer ID is stored (webhook may not have fired yet)
      if (session.customer && !req.user.stripe_customer_id) {
        await setStripeCustomerId(req.user.user_id, session.customer);
      }
      return res.redirect("/dashboard?upgraded=1");
    }

    return res.redirect("/dashboard");
  } catch (err) {
    next(err);
  }
});

// --- GET /billing/portal -- Stripe Customer Portal ----------------------------
router.get("/portal", requireSessionAuth, async (req, res, next) => {
  try {
    if (!req.user.stripe_customer_id) {
      // No Stripe customer yet -- send to upgrade flow instead
      return res.redirect("/upgrade");
    }

    const stripe = getStripe();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: req.user.stripe_customer_id,
      return_url: `${BASE_URL}/dashboard`,
    });

    return res.redirect(303, portalSession.url);
  } catch (err) {
    next(err);
  }
});

// --- POST /billing/webhook -- Stripe event handler ----------------------------
// Must be mounted BEFORE express.json() -- needs raw body for signature verification.
router.post(
  "/webhook",
  (req, res, next) => {
    // express.raw() buffers the raw body for Stripe signature verification
    let rawBody = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { rawBody += chunk; });
    req.on("end", () => {
      req.rawBody = rawBody;
      next();
    });
  },
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.warn("[Billing] STRIPE_WEBHOOK_SECRET not set -- skipping signature check");
      return res.json({ received: true });
    }

    let event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
      console.error(`[Billing] Webhook signature failed: ${err.message}`);
      return res.status(400).json({ error: `Webhook error: ${err.message}` });
    }

    console.log(`[Billing] Event: ${event.type}`);

    try {
      await handleStripeEvent(event);
    } catch (err) {
      console.error(`[Billing] Event handler failed: ${err.message}`);
      // Return 200 to prevent Stripe retries for handler errors
    }

    res.json({ received: true });
  }
);

// --- Stripe Event Handlers ----------------------------------------------------

async function handleStripeEvent(event) {
  switch (event.type) {
    // Subscription activated (new purchase or reactivation)
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id;
      if (!userId) {
        console.warn("[Billing] subscription event missing user_id metadata");
        return;
      }

      const plan = sub.status === "active" || sub.status === "trialing" ? "pro" : "free";
      console.log(`[Billing] User ${userId} -> plan: ${plan} (sub status: ${sub.status})`);

      await updateUserPlan(userId, plan);

      // Store Stripe customer ID if not already saved
      if (sub.customer) {
        const user = await getUserById(userId);
        if (user && !user.stripe_customer_id) {
          await setStripeCustomerId(userId, sub.customer);
        }
      }
      break;
    }

    // Subscription cancelled / payment failed beyond retry
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id;
      if (!userId) return;
      console.log(`[Billing] User ${userId} -> downgraded to free (subscription deleted)`);
      await updateUserPlan(userId, "free");
      break;
    }

    // Successful recurring payment -- keep plan active
    case "invoice.payment_succeeded": {
      const invoice = event.data.object;
      if (invoice.subscription) {
        const stripe = getStripe();
        const sub = await stripe.subscriptions.retrieve(invoice.subscription);
        const userId = sub.metadata?.user_id;
        if (userId) {
          await updateUserPlan(userId, "pro");
          console.log(`[Billing] Renewal confirmed -- user ${userId} remains Pro`);
        }
      }
      break;
    }

    // Payment failed -- could downgrade after retries exhaust, but don't act immediately
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      console.warn(`[Billing] Payment failed for subscription ${invoice.subscription}`);
      // Stripe handles retries -- we only downgrade on subscription.deleted
      break;
    }

    default:
      // Unhandled event type -- safe to ignore
      break;
  }
}

export const billingRouter = router;

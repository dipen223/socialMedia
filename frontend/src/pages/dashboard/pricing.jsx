import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import SectionPanel from "@/components/dashboard/SectionPanel";
import { clientServer } from "@/config";
import styles from "@/styles/pricing.module.css";

const CheckIcon = ({ muted }) => (
  <svg
    className={styles.checkIcon}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke={muted ? "#cbd5e1" : "#10b981"}
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const formatMinutes = (seconds) => Math.floor((seconds || 0) / 60);

export default function PricingPage() {
  const router = useRouter();
  const [billing, setBilling] = useState("monthly");
  const [status, setStatus] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [notice, setNotice] = useState("");

  const loadStatus = async () => {
    try {
      const { data } = await clientServer.get("/billing/status");
      setStatus(data);
    } catch {
      // Non-fatal - the page still works for choosing a plan without a status banner.
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.checkout === "success") {
      setNotice("Payment received! Your plan is being activated - this can take a few seconds.");
      // Stripe's webhook can arrive a moment after the redirect, so give it
      // a beat before re-checking, rather than showing stale "Free" status.
      const timeoutId = window.setTimeout(loadStatus, 2500);
      return () => window.clearTimeout(timeoutId);
    }
    if (router.query.checkout === "cancelled") {
      setNotice("Checkout was cancelled - no charge was made.");
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.checkout]);

  const startCheckout = async (plan) => {
    setErrorMsg("");
    setLoadingPlan(plan);
    try {
      const { data } = await clientServer.post("/billing/checkout", { plan, billing });
      window.location.href = data.url;
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not start checkout right now.");
      setLoadingPlan(null);
    }
  };

  const openPortal = async () => {
    setErrorMsg("");
    setLoadingPlan("portal");
    try {
      const { data } = await clientServer.post("/billing/portal");
      window.location.href = data.url;
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not open billing management right now.");
      setLoadingPlan(null);
    }
  };

  const currentPlan = status?.plan || "free";
  const isAnnual = billing === "annual";

  return (
    <DashboardLayout wide>
      <SectionPanel
        title="Plans & billing"
        description="Live call translation is a paid feature - pick the plan that fits how much you call."
      >
        {errorMsg && <div className={styles.errorNotice}>{errorMsg}</div>}
        {notice && <div className={styles.noticeSuccess}>{notice}</div>}

        {currentPlan !== "free" && (
          <div className={styles.usageBar}>
            {formatMinutes(status.translationSecondsUsed)} / {formatMinutes(status.translationSecondsLimit)}{" "}
            translated minutes used this cycle
            {status.translationOverageMinutes > 0 && (
              <> ({status.translationOverageMinutes} extra min billed at $0.06/min)</>
            )}
            .{" "}
            <button
              type="button"
              onClick={openPortal}
              disabled={loadingPlan === "portal"}
              style={{
                border: "none",
                background: "none",
                color: "#10b981",
                fontWeight: 800,
                cursor: "pointer",
                padding: 0,
                font: "inherit",
              }}
            >
              {loadingPlan === "portal" ? "Opening…" : "Manage billing"}
            </button>
          </div>
        )}

        <div className={styles.toggleRow}>
          <div className={styles.toggle}>
            <button
              type="button"
              className={`${styles.toggleBtn} ${!isAnnual ? styles.toggleBtnActive : ""}`}
              onClick={() => setBilling("monthly")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`${styles.toggleBtn} ${isAnnual ? styles.toggleBtnActive : ""}`}
              onClick={() => setBilling("annual")}
            >
              Annual <span className={styles.saveBadge}>Save 20%</span>
            </button>
          </div>
        </div>

        <div className={styles.grid}>
          <div className={styles.card}>
            <div>
              <h3 className={styles.cardTitle}>Free</h3>
              <p className={styles.cardSubtitle}>Everything social, calls included.</p>
            </div>
            <div className={styles.priceRow}>
              <div className={styles.priceLine}>
                <span className={styles.price}>$0</span>
                <span className={styles.cadence}>/month</span>
              </div>
            </div>
            <button type="button" className={`${styles.cta} ${styles.ctaCurrent}`} disabled aria-disabled="true">
              {currentPlan === "free" ? "Current plan" : "Included"}
            </button>
            <div className={styles.divider} />
            <ul className={styles.features}>
              <li className={styles.feature}>
                <CheckIcon />
                <span>Posts, stories, messaging &amp; connections</span>
              </li>
              <li className={styles.feature}>
                <CheckIcon />
                <span>Unlimited audio &amp; video calls</span>
              </li>
              <li className={`${styles.feature} ${styles.featureMuted}`}>
                <CheckIcon muted />
                <span>No live call translation</span>
              </li>
            </ul>
          </div>

          <div className={`${styles.card} ${styles.cardHighlight}`}>
            <span className={styles.badge}>Most Popular</span>
            <div>
              <h3 className={styles.cardTitle}>Plus</h3>
              <p className={styles.cardSubtitle}>For regular calls with friends and family abroad.</p>
            </div>
            <div className={styles.priceRow}>
              <div className={styles.priceLine}>
                <span className={styles.price}>{isAnnual ? "$5.58" : "$6.99"}</span>
                <span className={styles.cadence}>{isAnnual ? "/mo, billed annually" : "/month"}</span>
              </div>
              {isAnnual && <span className={styles.annualNote}>$67/year billed yearly</span>}
            </div>
            <button
              type="button"
              className={`${styles.cta} ${currentPlan === "plus" ? styles.ctaCurrent : styles.ctaPrimary}`}
              onClick={() => startCheckout("plus")}
              disabled={currentPlan === "plus" || Boolean(loadingPlan)}
            >
              {currentPlan === "plus" ? "Current plan" : loadingPlan === "plus" ? "Redirecting…" : "Get Plus"}
            </button>
            <div className={styles.divider} />
            <ul className={styles.features}>
              <li className={styles.feature}>
                <CheckIcon />
                <span>Everything in Free</span>
              </li>
              <li className={styles.feature}>
                <CheckIcon />
                <span>
                  <strong>200 translated minutes</strong> / month included
                </span>
              </li>
              <li className={styles.feature}>
                <CheckIcon />
                <span>Extra minutes bill automatically at $0.06/min - never a hard cutoff mid-call</span>
              </li>
              <li className={styles.feature}>
                <CheckIcon />
                <span>Natural, warm translated voice</span>
              </li>
              <li className={styles.feature}>
                <CheckIcon />
                <span>Priority translation processing</span>
              </li>
            </ul>
          </div>
        </div>

        <p className={styles.footnote}>Included minutes reset each billing cycle and don&apos;t roll over.</p>
      </SectionPanel>
    </DashboardLayout>
  );
}

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { fetchReports, updateReport } from "@/config/admin";
import { REPORT_REASONS } from "@/config/safety";
import styles from "@/styles/adminReports.module.css";

const TABS = [
  { value: "open", label: "Open" },
  { value: "reviewed", label: "Reviewed" },
  { value: "dismissed", label: "Dismissed" },
];

const reasonLabel = (value) =>
  REPORT_REASONS.find((reason) => reason.value === value)?.label || value;

export default function AdminReportsPage() {
  const [tab, setTab] = useState("open");
  const [reports, setReports] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [openCount, setOpenCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  // All state changes here happen after the request returns; the callers
  // (initial mount, tab click, "load more") do any resetting beforehand.
  const load = useCallback(async (status, before) => {
    try {
      const data = await fetchReports({ status, before });
      setReports((previous) => (before ? [...previous, ...data.reports] : data.reports));
      setCursor(data.nextCursor || null);
      setOpenCount(data.openCount);
      setError("");
    } catch (err) {
      if (err.response?.status === 403) setForbidden(true);
      else setError(err.response?.data?.message || "Could not load reports.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchReports({ status: "open" });
        if (cancelled) return;
        setReports(data.reports);
        setCursor(data.nextCursor || null);
        setOpenCount(data.openCount);
      } catch (err) {
        if (cancelled) return;
        if (err.response?.status === 403) setForbidden(true);
        else setError(err.response?.data?.message || "Could not load reports.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const switchTab = (next) => {
    if (next === tab) return;
    setTab(next);
    setReports([]);
    setCursor(null);
    setLoading(true);
    load(next);
  };

  const loadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    load(tab, cursor);
  };

  const act = async (report, { status, contentAction }) => {
    if (busyId) return;
    setBusyId(report._id);
    setError("");
    try {
      await updateReport(report._id, { status, contentAction });
      // Reflect the change locally: it leaves this tab if its status changed,
      // otherwise (restoring a post) just updates in place.
      setReports((current) =>
        status !== tab
          ? current.filter((item) => item._id !== report._id)
          : current.map((item) =>
              item._id === report._id
                ? {
                    ...item,
                    content:
                      item.content && contentAction
                        ? { ...item.content, hidden: contentAction === "hide" }
                        : item.content,
                  }
                : item
            )
      );
      if (tab === "open" && status !== "open") setOpenCount((count) => Math.max(0, (count || 1) - 1));
      if (tab !== "open" && status === "open") setOpenCount((count) => (count || 0) + 1);
    } catch (err) {
      setError(err.response?.data?.message || "Could not update that report.");
    } finally {
      setBusyId(null);
    }
  };

  if (forbidden) {
    return (
      <DashboardLayout wide>
        <div className={styles.page}>
          <div className={styles.empty}>
            <h1>Admins only</h1>
            <p>You don&apos;t have access to this page.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout wide>
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <h1>Reports</h1>
            <p>
              {openCount === null ? "Loading…" : `${openCount} open`} · review what people have
              flagged and decide what happens to it.
            </p>
          </div>
        </header>

        <div className={styles.tabs} role="tablist" aria-label="Report status">
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={tab === value ? styles.tabActive : styles.tab}
              onClick={() => switchTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <p className={styles.error} role="alert">{error}</p>}
        {loading && <p className={styles.status} role="status">Loading reports…</p>}

        {!loading && !error && reports.length === 0 && (
          <div className={styles.empty}>
            <h2>Nothing here</h2>
            <p>{tab === "open" ? "No open reports. Nice." : `No ${tab} reports.`}</p>
          </div>
        )}

        <ul className={styles.list}>
          {reports.map((report) => {
            const isPost = report.targetType === "post";
            const busy = busyId === report._id;
            return (
              <li key={report._id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.reason}>{reasonLabel(report.reason)}</span>
                  <span className={styles.meta}>
                    {report.targetType} · {new Date(report.createdAt).toLocaleString()}
                  </span>
                </div>

                <p className={styles.people}>
                  Reported by <strong>@{report.reporter?.username || "deleted user"}</strong> · about{" "}
                  {report.targetUser?.username ? (
                    <Link href={`/${report.targetUser.username}`}>@{report.targetUser.username}</Link>
                  ) : (
                    <strong>a deleted user</strong>
                  )}
                  {report.reportsAgainstUser > 1 && (
                    <span className={styles.repeat}>
                      {report.reportsAgainstUser} reports against them
                    </span>
                  )}
                </p>

                {report.details && <blockquote className={styles.details}>{report.details}</blockquote>}

                <div className={styles.content}>
                  {report.targetType === "user" && <em>The account itself was reported.</em>}
                  {report.targetType !== "user" && !report.content && (
                    <em>This content has since been deleted.</em>
                  )}
                  {report.content?.hidden && <span className={styles.hiddenTag}>Hidden from feeds</span>}
                  {report.content?.body && <p>{report.content.body}</p>}
                  {report.content?.media &&
                    (report.content.fileType?.startsWith("video/") ? (
                      <video src={report.content.media} controls preload="metadata" />
                    ) : (
                      <img src={report.content.media} alt="Reported attachment" />
                    ))}
                </div>

                <div className={styles.actions}>
                  {isPost && report.content && (
                    <Link href={`/dashboard/posts/${report.targetId}`} className={styles.link}>
                      View post
                    </Link>
                  )}
                  <span className={styles.spacer} />

                  {report.status === "open" ? (
                    <>
                      <button type="button" disabled={busy} onClick={() => act(report, { status: "dismissed" })}>
                        Dismiss
                      </button>
                      <button type="button" disabled={busy} onClick={() => act(report, { status: "reviewed" })}>
                        Mark reviewed
                      </button>
                      {isPost && report.content && !report.content.hidden && (
                        <button
                          type="button"
                          className={styles.danger}
                          disabled={busy}
                          onClick={() => act(report, { status: "reviewed", contentAction: "hide" })}
                        >
                          Hide post
                        </button>
                      )}
                    </>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => act(report, { status: "open" })}>
                      Reopen
                    </button>
                  )}
                  {isPost && report.content?.hidden && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act(report, { status: report.status, contentAction: "restore" })}
                    >
                      Restore post
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {cursor && !loading && (
          <button type="button" className={styles.more} onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </DashboardLayout>
  );
}

"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resolveCalendarConflict, retrySync } from "@/app/actions/jobActions";

type ReconciliationIssue = {
  jobId: string;
  customerName: string | null;
  eventType: "site_visit" | "job" | "second_visit";
  state: "no_event_id" | "missing" | "cancelled" | "time_mismatch";
  eventId: string | null;
  expectedStart: string | null;
  actualStart: string | null;
};

type FailedSync = { jobId: string; integration: string; status: string; error: string | null };

const STATE_COPY: Record<ReconciliationIssue["state"], { label: string; detail: string }> = {
  no_event_id: { label: "Not on calendar", detail: "This visit is scheduled but has no calendar event yet." },
  missing: { label: "Event deleted", detail: "The calendar event no longer exists on Google." },
  cancelled: { label: "Event cancelled", detail: "The event was deleted in Calendar and is invisible there." },
  time_mismatch: { label: "Time differs", detail: "Calendar and the app disagree on when this is scheduled." },
};

type LogRow = {
  id: string;
  job_id: string | null;
  event_type: string | null;
  operation: string;
  event_id: string | null;
  success: boolean;
  error: string | null;
  created_at: string;
};

const OPERATIONS = ["All", "create", "update", "delete", "drift_detected"];
const OUTCOMES = [
  { value: "All", label: "All outcomes" },
  { value: "success", label: "Success only" },
  { value: "failed", label: "Failures only" },
];

const OP_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  create: { bg: "#dcfce7", color: "#166534", label: "Created" },
  update: { bg: "#eff6ff", color: "#1d4ed8", label: "Updated" },
  delete: { bg: "#fee2e2", color: "#991b1b", label: "Deleted" },
  drift_detected: { bg: "#fef3c7", color: "#92400e", label: "Drift found" },
};

const TYPE_LABELS: Record<string, string> = {
  site_visit: "Site Visit",
  job: "Job",
  second_visit: "2nd Visit",
};

export default function LogsClient({
  logs,
  jobNames,
  totalCount,
  pageSize,
  filters,
  checked,
  issues,
  failedSyncs,
  cronStale,
  lastCronRunAt,
}: {
  logs: LogRow[];
  jobNames: Record<string, string>;
  totalCount: number;
  pageSize: number;
  filters: { operation: string; outcome: string; q: string; page: number };
  checked: number;
  issues: ReconciliationIssue[];
  failedSyncs: FailedSync[];
  cronStale: boolean;
  lastCronRunAt: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localSearch, setLocalSearch] = useState(filters.q);
  const [expanded, setExpanded] = useState<string | null>(null);

  const buildUrl = (next: Partial<typeof filters>) => {
    const merged = { ...filters, ...next };
    const sp = new URLSearchParams();
    if (merged.operation !== "All") sp.set("operation", merged.operation);
    if (merged.outcome !== "All") sp.set("outcome", merged.outcome);
    if (merged.q) sp.set("q", merged.q);
    if (merged.page > 1) sp.set("page", String(merged.page));
    const qs = sp.toString();
    return `/dashboard/logs${qs ? `?${qs}` : ""}`;
  };

  const push = (next: Partial<typeof filters>) => {
    startTransition(() => router.push(buildUrl(next), { scroll: false }));
  };

  // Debounce the search box so typing doesn't fire a request per keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== filters.q) push({ q: localSearch, page: 1 });
    }, 400);
    return () => clearTimeout(timer);
  }, [localSearch]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const failureCount = logs.filter((l) => !l.success).length;

  const [resolving, setResolving] = useState<string | null>(null);

  const conflicts = issues.filter((i) => i.state === "time_mismatch");
  const broken = issues.filter((i) => i.state !== "time_mismatch");
  const problemCount = conflicts.length + failedSyncs.length;

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" }) : "—";

  const handleResolve = async (
    issue: ReconciliationIssue,
    resolution: "accept_calendar" | "keep_app"
  ) => {
    const key = `${issue.jobId}-${issue.eventType}`;
    setResolving(key);
    const result = await resolveCalendarConflict(issue.jobId, issue.eventType, resolution);
    setResolving(null);
    if (result?.error) alert("Could not resolve: " + result.error);
    else router.refresh();
  };

  const handleRetry = async (sync: FailedSync) => {
    const key = `${sync.jobId}-${sync.integration}`;
    setResolving(key);
    const result = await retrySync(sync.jobId, sync.integration as any);
    setResolving(null);
    if (result?.error) alert("Still failing: " + result.error);
    else router.refresh();
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto", color: "#0f172a" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 8px 0" }}>
          Calendar Sync Health
        </h1>
        <p style={{ color: "#64748b", margin: 0, fontSize: 15 }}>
          Checked {checked} scheduled visit{checked === 1 ? "" : "s"} against Google Calendar just now.
        </p>
      </div>

      {/* ── The safety net itself isn't running ── */}
      {cronStale && (
        <div style={{ background: "#fef2f2", border: "2px solid #fecaca", borderRadius: 12, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span style={{ fontSize: 24, lineHeight: 1 }}>🚨</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#991b1b" }}>
              The daily automatic check is not running.
            </div>
            <div style={{ fontSize: 13, color: "#b91c1c", marginTop: 4, lineHeight: 1.5 }}>
              {lastCronRunAt
                ? `It last ran on ${new Date(lastCronRunAt).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })}.`
                : "It has never run."}{" "}
              Nothing is checking overnight that jobs actually reached Google Calendar, and no alert emails
              will be sent. Usually this means <code style={{ background: "#fee2e2", padding: "1px 5px", borderRadius: 4 }}>CRON_SECRET</code>{" "}
              is missing or wrong in the deployment settings.
            </div>
          </div>
        </div>
      )}

      {/* ── Health summary: the number that should always be zero ── */}
      <div
        style={{
          background: problemCount === 0 ? "#f0fdf4" : "#fffbeb",
          border: `1px solid ${problemCount === 0 ? "#bbf7d0" : "#fde68a"}`,
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 24, lineHeight: 1 }}>{problemCount === 0 ? "✅" : "⚠️"}</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: problemCount === 0 ? "#166534" : "#92400e" }}>
            {problemCount === 0
              ? "Every scheduled job matches Google Calendar."
              : `${problemCount} item${problemCount === 1 ? "" : "s"} need attention.`}
          </div>
          {broken.length > 0 && (
            <div style={{ fontSize: 12, color: "#92400e", marginTop: 3 }}>
              {broken.length} broken event{broken.length === 1 ? " was" : "s were"} found and repaired automatically.
            </div>
          )}
        </div>
      </div>

      {/* ── Conflicts: deliberately NOT auto-fixed, a human has to choose ── */}
      {conflicts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#0f172a", marginBottom: 4 }}>
            Scheduling conflicts
          </h2>
          <p style={{ fontSize: 12.5, color: "#64748b", margin: "0 0 12px 0" }}>
            Someone changed the time in Google Calendar. These aren't corrected automatically — a reschedule made
            there is usually deliberate, so pick which one is right.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {conflicts.map((issue) => {
              const key = `${issue.jobId}-${issue.eventType}`;
              const busy = resolving === key;
              return (
                <div key={key} style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 12, padding: "14px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/dashboard/jobs/${issue.jobId}`} style={{ fontSize: 14, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>
                        {issue.customerName ?? issue.jobId.slice(0, 8)}
                      </Link>
                      <span style={{ fontSize: 12, color: "#64748b" }}> · {TYPE_LABELS[issue.eventType] ?? issue.eventType}</span>
                      <div style={{ fontSize: 12.5, color: "#475569", marginTop: 6 }}>
                        App says <strong>{fmt(issue.expectedStart)}</strong>
                      </div>
                      <div style={{ fontSize: 12.5, color: "#475569" }}>
                        Calendar says <strong>{fmt(issue.actualStart)}</strong>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleResolve(issue, "accept_calendar")}
                        style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#0f172a", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", whiteSpace: "nowrap" }}
                      >
                        {busy ? "Working…" : "Use Calendar's time"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleResolve(issue, "keep_app")}
                        style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", whiteSpace: "nowrap" }}
                      >
                        Keep app's time
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Syncs still failing after retries ── */}
      {failedSyncs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#0f172a", marginBottom: 12 }}>
            Failing syncs
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {failedSyncs.map((sync) => {
              const key = `${sync.jobId}-${sync.integration}`;
              const busy = resolving === key;
              return (
                <div key={key} style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: 12, padding: "14px 18px", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Link href={`/dashboard/jobs/${sync.jobId}`} style={{ fontSize: 14, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>
                      {jobNames[sync.jobId] ?? sync.jobId.slice(0, 8)}
                    </Link>
                    <span style={{ fontSize: 12, color: "#64748b" }}> · {sync.integration}</span>
                    {sync.error && (
                      <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {sync.error.length > 180 ? `${sync.error.slice(0, 180)}…` : sync.error}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRetry(sync)}
                    style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", whiteSpace: "nowrap" }}
                  >
                    {busy ? "Retrying…" : "Retry"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── History ── */}
      <h2 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#0f172a", marginBottom: 4 }}>
        History
      </h2>
      <p style={{ fontSize: 12.5, color: "#64748b", margin: "0 0 12px 0" }}>
        Every Google Calendar change this app has made ({totalCount.toLocaleString()} entries).
        {failureCount > 0 && (
          <span style={{ color: "#b91c1c", fontWeight: 600 }}>
            {" "}· {failureCount} failure{failureCount === 1 ? "" : "s"} on this page
          </span>
        )}
      </p>

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search event ID or error text..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, maxWidth: 340, padding: "9px 13px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, outline: "none" }}
        />
        <select
          value={filters.operation}
          onChange={(e) => push({ operation: e.target.value, page: 1 })}
          style={{ padding: "9px 13px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, background: "#fff", cursor: "pointer" }}
        >
          {OPERATIONS.map((op) => (
            <option key={op} value={op}>{op === "All" ? "All operations" : OP_STYLES[op]?.label ?? op}</option>
          ))}
        </select>
        <select
          value={filters.outcome}
          onChange={(e) => push({ outcome: e.target.value, page: 1 })}
          style={{ padding: "9px 13px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, background: "#fff", cursor: "pointer" }}
        >
          {OUTCOMES.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {(filters.operation !== "All" || filters.outcome !== "All" || filters.q) && (
          <button
            onClick={() => { setLocalSearch(""); push({ operation: "All", outcome: "All", q: "", page: 1 }); }}
            style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#64748b", cursor: "pointer" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", opacity: isPending ? 0.6 : 1, transition: "opacity 0.15s" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f1f5f9", color: "#475569", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ padding: "12px 16px", fontWeight: 600, whiteSpace: "nowrap" }}>When</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Job</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Slot</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Action</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
                    No log entries match these filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const op = OP_STYLES[log.operation] ?? { bg: "#f1f5f9", color: "#475569", label: log.operation };
                  const isOpen = expanded === log.id;
                  return (
                    <tr key={log.id} style={{ borderTop: "1px solid #f1f5f9", background: log.success ? "transparent" : "#fffbfb" }}>
                      <td style={{ padding: "12px 16px", color: "#64748b", whiteSpace: "nowrap", fontSize: 13 }}>
                        {new Date(log.created_at).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {log.job_id ? (
                          <Link href={`/dashboard/jobs/${log.job_id}`} style={{ color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>
                            {jobNames[log.job_id] ?? log.job_id.slice(0, 8)}
                          </Link>
                        ) : (
                          <span style={{ color: "#cbd5e1" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#475569" }}>
                        {log.event_type ? TYPE_LABELS[log.event_type] ?? log.event_type : "—"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: op.bg, color: op.color, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {op.label}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {log.success ? (
                          <span style={{ color: "#16a34a", fontWeight: 600, fontSize: 13 }}>✓ OK</span>
                        ) : (
                          <div>
                            <button
                              onClick={() => setExpanded(isOpen ? null : log.id)}
                              style={{ background: "none", border: "none", padding: 0, color: "#dc2626", fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "left" }}
                            >
                              ✕ Failed {isOpen ? "▴" : "▾"}
                            </button>
                            {isOpen && log.error && (
                              <pre style={{ marginTop: 8, padding: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: 460, overflowX: "auto" }}>
                                {log.error}
                              </pre>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <span style={{ fontSize: 13, color: "#64748b" }}>
            Page {filters.page} of {totalPages}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              disabled={filters.page <= 1}
              onClick={() => push({ page: filters.page - 1 })}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 13, fontWeight: 600, color: filters.page <= 1 ? "#cbd5e1" : "#475569", cursor: filters.page <= 1 ? "default" : "pointer" }}
            >
              Previous
            </button>
            <button
              disabled={filters.page >= totalPages}
              onClick={() => push({ page: filters.page + 1 })}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 13, fontWeight: 600, color: filters.page >= totalPages ? "#cbd5e1" : "#475569", cursor: filters.page >= totalPages ? "default" : "pointer" }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

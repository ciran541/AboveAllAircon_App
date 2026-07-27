"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
}: {
  logs: LogRow[];
  jobNames: Record<string, string>;
  totalCount: number;
  pageSize: number;
  filters: { operation: string; outcome: string; q: string; page: number };
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

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto", color: "#0f172a" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 8px 0" }}>
          Calendar Sync Log
        </h1>
        <p style={{ color: "#64748b", margin: 0, fontSize: 15 }}>
          Every Google Calendar change this app has made ({totalCount.toLocaleString()} entries).
          {failureCount > 0 && (
            <span style={{ color: "#b91c1c", fontWeight: 600 }}>
              {" "}· {failureCount} failure{failureCount === 1 ? "" : "s"} on this page
            </span>
          )}
        </p>
      </div>

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

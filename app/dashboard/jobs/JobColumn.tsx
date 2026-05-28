"use client";

import { Job } from "./JobsClient";
import { getStageDisplay } from "@/lib/constants";
import { useRouter } from "next/navigation";

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconMapPin() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function IconBox() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

// ── Stage dot colors — one signal only ───────────────────────────────────────

const STAGE_DOT: Record<string, string> = {
  "New Enquiry":                "#94a3b8",
  "Site Visit Scheduled":       "#8b5cf6",
  "Quotation Sent":             "#f59e0b",
  "Job Scheduled":              "#3b82f6",
  "First Visit":                "#f97316",
  "Second Visit":               "#a855f7",
  "Job Done (Payment Pending)": "#10b981",
  "Completed":                  "#059669",
};


// ── Stage-aware overdue ───────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split("T")[0];

function getOverdueDate(job: Job, stageDisplay: string): string | null {
  switch (stageDisplay) {
    case "Site Visit Scheduled":       return job.visit_date ?? null;
    case "Quotation Sent":             return job.expiry_date ?? null;
    case "Job Scheduled":
    case "First Visit":                return job.job_date ?? null;
    case "Second Visit":               return job.second_visit_date ?? job.job_date ?? null;
    case "Job Done (Payment Pending)": return job.job_date ?? null;
    default:                           return null;
  }
}

function isJobOverdue(job: Job, stageDisplay: string): boolean {
  if (stageDisplay === "Completed") return false;
  if (job.status && job.status !== "open") return false;
  const d = getOverdueDate(job, stageDisplay);
  return !!(d && d < TODAY);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function JobColumn({
  stage,
  jobs,
  onJobClick,
  onDropJob,
  onDeleteJob,
}: {
  stage: string;
  jobs: Job[];
  onJobClick: (job: Job) => void;
  onDropJob: (jobId: string, newStage: string) => void;
  onDeleteJob: (job: Job) => void;
}) {
  const router = useRouter();
  const dot = STAGE_DOT[stage] ?? "#94a3b8";

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.add("pipeline-col-drop-target");
  };
  const handleDragLeave = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove("pipeline-col-drop-target");
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove("pipeline-col-drop-target");
    const jobId = e.dataTransfer.getData("text/plain");
    if (jobId) onDropJob(jobId, stage);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        flex: 1,
        minWidth: 280,
        maxWidth: 320,
        background: "#f4f6f9",
        border: "1px solid #e3e8f0",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div style={{
        padding: "12px 14px 11px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid #e3e8f0",
        background: "#f4f6f9",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: dot, flexShrink: 0,
            boxShadow: `0 0 0 2px ${dot}26`,
          }} />
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: "#4b5563",
            textTransform: "uppercase",
            letterSpacing: "0.55px",
          }}>
            {getStageDisplay(stage)}
          </span>
        </div>
        <span style={{
          fontSize: 11.5, fontWeight: 600,
          color: "#9ca3af",
          minWidth: 18,
          textAlign: "right",
        }}>
          {jobs.length}
        </span>
      </div>

      {/* ── Cards ── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        padding: "10px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}>
        {jobs.map((job) => {
          const stageDisplay = getStageDisplay(job.stage);
          const overdue = isJobOverdue(job, stageDisplay);
          const overdueDate = getOverdueDate(job, stageDisplay);
          const name = job.customers?.name || "Unnamed";

          return (
            <div
              key={job.id}
              draggable
              className="job-card-v2"
              style={{
                background: "#ffffff",
                border: "1px solid #e8ecf2",
                borderRadius: 9,
                padding: "11px 12px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 9,
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                position: "relative",
              } as React.CSSProperties}
              onDragStart={(e) => e.dataTransfer.setData("text/plain", job.id)}
              onClick={() => onJobClick(job)}
              onMouseEnter={() => router.prefetch(`/dashboard/jobs/${job.id}`)}
            >
              {/* Header: name + delete */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    color: "#111827",
                    lineHeight: 1.3,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, fontWeight: 500 }}>
                    {job.service_type || "—"}
                    {job.unit_count > 0 && ` · ${job.unit_count} unit${job.unit_count !== 1 ? "s" : ""}`}
                    {job.ac_brand ? ` · ${job.ac_brand}` : ""}
                  </div>
                </div>
                <button
                  title="Delete job"
                  className="job-card-delete-btn"
                  onClick={(e) => { e.stopPropagation(); onDeleteJob(job); }}
                  style={{
                    width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                    background: "transparent", border: "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#d1d5db", cursor: "pointer",
                    transition: "color 0.15s, background 0.15s",
                  }}
                >
                  <IconTrash />
                </button>
              </div>

              {/* Meta */}
              {(job.customers?.address || overdueDate) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, color: "#6b7280", fontSize: 11.5 }}>
                  {job.customers?.address && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ flexShrink: 0, opacity: 0.6 }}><IconMapPin /></span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={job.customers.address}>
                        {job.customers.address}
                      </span>
                    </div>
                  )}
                  {overdueDate && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ flexShrink: 0, opacity: overdue ? 1 : 0.6, color: overdue ? "#ef4444" : "inherit" }}>
                        <IconCalendar />
                      </span>
                      <span style={{ fontWeight: overdue ? 600 : 400, color: overdue ? "#ef4444" : "#6b7280" }}>
                        {overdueDate}
                      </span>
                      {overdue && (
                        <span style={{
                          fontSize: 10, fontWeight: 600,
                          color: "#dc2626",
                          background: "#fef2f2",
                          padding: "1px 5px",
                          borderRadius: 4,
                          letterSpacing: "0.2px",
                        }}>
                          overdue
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Footer: payment only */}
              {job.quoted_amount > 0 && (
                <div style={{
                  display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 5,
                  paddingTop: 8, borderTop: "1px solid #f3f4f6",
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>
                    ${job.quoted_amount.toFixed(2)}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: job.payment_status === "Paid" ? "#059669" : "#d97706",
                    background: job.payment_status === "Paid" ? "#f0fdf4" : "#fffbeb",
                    padding: "1px 5px", borderRadius: 4,
                  }}>
                    {job.payment_status === "Paid" ? "Paid" : "Pending"}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {jobs.length === 0 && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "32px 16px", gap: 8,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9 9h6M9 12h6M9 15h4" />
            </svg>
            <span style={{ color: "#c4c9d4", fontSize: 12, fontWeight: 500 }}>No jobs</span>
          </div>
        )}
      </div>
    </div>
  );
}

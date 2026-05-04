"use client";

import { Job } from "./JobsClient";
import { getStageDisplay } from "@/lib/constants";
import { useRouter } from "next/navigation";

function IconMapPin() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function IconBox() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

const STAGE_THEMES: Record<string, { bg: string; color: string; border: string }> = {
  "New Enquiry":          { bg: "#f8fafc", color: "#475569", border: "#cbd5e1" },
  "Site Visit Scheduled": { bg: "#f5f3ff", color: "#7c3aed", border: "#c4b5fd" },
  "Quotation Sent":       { bg: "#fffbeb", color: "#d97706", border: "#fcd34d" },
  "Job Scheduled":        { bg: "#eff6ff", color: "#2563eb", border: "#93c5fd" },
  "First Visit":          { bg: "#fff7ed", color: "#ea580c", border: "#fdba74" },
  "Job Done (Payment Pending)": { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  "Completed":            { bg: "#ecfdf5", color: "#059669", border: "#6ee7b7" },
};

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
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).style.boxShadow = "inset 0 0 0 2px var(--accent)";
  };
  const handleDragLeave = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.boxShadow = "none";
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).style.boxShadow = "none";
    const jobId = e.dataTransfer.getData("text/plain");
    if (jobId) onDropJob(jobId, stage);
  };

  const theme = STAGE_THEMES[stage] || STAGE_THEMES["New Enquiry"];

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        flex: 1, minWidth: 280, maxWidth: 320, background: "#f8fafc",
        border: "1px solid #e2e8f0", borderRadius: 14,
        display: "flex", flexDirection: "column", maxHeight: "100%",
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)", transition: "box-shadow 0.2s", overflow: "hidden",
      }}
    >
      {/* Column Header */}
      <div style={{
        padding: "14px 16px", background: theme.bg, borderBottom: `2px solid ${theme.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: theme.color, textTransform: "uppercase", letterSpacing: "0.6px" }}>
          {getStageDisplay(stage)}
        </span>
        <span style={{
          background: "#fff", color: theme.color, fontSize: 11, padding: "2px 8px",
          borderRadius: 99, border: `1px solid ${theme.border}`, fontWeight: 700, boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        }}>
          {jobs.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {jobs.map((job) => {
          let svcBg = "#f1f5f9", svcCol = "#475569";
          if (job.service_type === "Servicing")    { svcBg = "#eff6ff"; svcCol = "#2563eb"; }
          if (job.service_type === "Installation") { svcBg = "#fdf4ff"; svcCol = "#c026d3"; }

          return (
            <div
              key={job.id}
              draggable
              className="job-card-interactive"
              onDragStart={(e) => e.dataTransfer.setData("text/plain", job.id)}
              onClick={() => onJobClick(job)}
              style={{
                background: "#fff", border: "1px solid #e4e9f0", borderRadius: 12,
                padding: "14px", cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                display: "flex", flexDirection: "column", gap: 10, position: "relative",
              }}
              onMouseEnter={(e) => {
                router.prefetch(`/dashboard/jobs/${job.id}`);
                (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 16px -4px rgba(0,0,0,0.08)";
                (e.currentTarget as HTMLElement).style.borderColor = theme.color;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "none";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
                (e.currentTarget as HTMLElement).style.borderColor = "#e4e9f0";
              }}
            >
              {/* Delete button */}
              <button
                title="Delete job"
                onClick={(e) => { e.stopPropagation(); onDeleteJob(job); }}
                style={{
                  position: "absolute", top: 10, right: 10,
                  width: 26, height: 26, borderRadius: 6,
                  background: "transparent", border: "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#cbd5e1", cursor: "pointer", transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#fef2f2";
                  (e.currentTarget as HTMLElement).style.color = "#ef4444";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = "#cbd5e1";
                }}
              >
                <IconTrash />
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, paddingRight: 20 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "#0f172a", lineHeight: 1.3 }}>
                  {job.customers?.name || "Unnamed Client"}
                </span>
                <span style={{
                  fontSize: 10, background: svcBg, color: svcCol,
                  padding: "3px 8px", borderRadius: 99, fontWeight: 700,
                  whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${svcCol}33`
                }}>
                  {job.service_type || "Unknown"}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, color: "#64748b" }}>
                {job.unit_count > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <IconBox />
                    <span>{job.unit_count} Units {job.ac_brand ? `(${job.ac_brand})` : ""}</span>
                  </div>
                )}
                {job.customers?.address && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <IconMapPin />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", maxWidth: 180 }} title={job.customers.address}>
                      {job.customers.address}
                    </span>
                  </div>
                )}
                {(job.job_date || job.visit_date) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <IconCalendar />
                    <span>{job.job_date || job.visit_date}</span>
                  </div>
                )}
              </div>

              {job.assigned_to && (
                <div style={{ marginTop: 2, paddingTop: 10, borderTop: "1px dashed #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "#2563eb" }}>
                    <IconUser />Assigned
                  </div>
                  {job.payment_status === "Paid" && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "#059669", background: "#ecfdf5", padding: "2px 6px", borderRadius: 4 }}>
                      {job.quoted_amount > 0 ? `$${job.quoted_amount.toFixed(2)} ` : ""}Paid
                    </span>
                  )}
                  {job.payment_status === "Pending" && (
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: "#d97706" }}>
                      {job.quoted_amount > 0 ? `$${job.quoted_amount.toFixed(2)} ` : ""}Pending
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {jobs.length === 0 && (
          <div style={{ padding: "32px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ width: 40, height: 40, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>📋</div>
            <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 500 }}>No jobs in this stage</div>
          </div>
        )}
      </div>
    </div>
  );
}

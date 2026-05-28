"use client";

import { Job } from "./JobsClient";
import { getStageDisplay } from "@/lib/constants";
import { useRouter } from "next/navigation";

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

function getStageDot(dbStage: string): string {
  const display = getStageDisplay(dbStage);
  return STAGE_DOT[display] ?? "#94a3b8";
}

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

export default function JobListView({
  jobs,
  onJobClick,
  staffProfiles,
}: {
  jobs: Job[];
  onJobClick: (job: Job) => void;
  staffProfiles: { id: string; role: string; full_name?: string; name?: string; email?: string }[];
}) {
  const router = useRouter();

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
            <th style={{ padding: "12px 20px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", width: "25%" }}>Customer</th>
            <th style={{ padding: "12px 20px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", width: "25%" }}>Job Detail</th>
            <th style={{ padding: "12px 20px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", width: 200 }}>Stage</th>
            <th style={{ padding: "12px 20px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right", width: 140 }}>Billing</th>
            <th style={{ padding: "12px 20px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", width: 160 }}>Scheduled Date</th>
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: "48px 20px", textAlign: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 40, height: 40, background: "#f1f5f9", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                  </div>
                  <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>No jobs found matching your filters</span>
                </div>
              </td>
            </tr>
          ) : (
            jobs.map((job) => {
              const staff = staffProfiles.find((s) => s.id === job.assigned_to);
              const stageDisplay = getStageDisplay(job.stage);
              const overdue = isJobOverdue(job, stageDisplay);
              const overdueDate = getOverdueDate(job, stageDisplay);
              const stageDot = getStageDot(job.stage);

              return (
                <tr
                  key={job.id}
                  onClick={() => onJobClick(job)}
                  onMouseEnter={() => router.prefetch(`/dashboard/jobs/${job.id}`)}
                  style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                  className="list-row-v2 list-row-interactive"
                >
                  <td style={{ padding: "13px 20px" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{job.customers?.name || "Unknown"}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{job.customers?.phone || ""}</div>
                  </td>
                  <td style={{ padding: "13px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{job.ac_brand || "—"}</span>
                      <span style={{ fontSize: 11, background: "#f1f5f9", padding: "2px 7px", borderRadius: 5, color: "#64748b", fontWeight: 600 }}>
                        {job.unit_count} units
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{job.service_type}</div>
                  </td>
                  <td style={{ padding: "13px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: stageDot, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>
                        {getStageDisplay(job.stage)}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "13px 20px", textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
                      {job.quoted_amount > 0 ? `$${Number(job.quoted_amount).toFixed(2)}` : "—"}
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                      background: job.payment_status === "Paid" ? "#dcfce7" : "#fefce8",
                      color: job.payment_status === "Paid" ? "#166534" : "#854d0e",
                      border: `1px solid ${job.payment_status === "Paid" ? "#bbf7d0" : "#fde68a"}`,
                      textTransform: "uppercase" as const,
                    }}>
                      {job.payment_status || "Pending"}
                    </span>
                  </td>
                  <td style={{ padding: "13px 20px" }}>
                    {overdueDate ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 600, color: overdue ? "#dc2626" : "#0f172a" }}>
                          {overdueDate}
                        </div>
                        {overdue ? (
                          <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            Overdue
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                            {stageDisplay === "Quotation Sent" ? "Expiry" : job.job_date ? "Job date" : "Visit date"}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>Not scheduled</div>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

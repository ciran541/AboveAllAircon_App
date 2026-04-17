"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import JobColumn from "./JobColumn";
import JobListView from "./JobListView";
import JobModal from "./JobModal";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SiteVisitModal, QuotationModal, WhatsAppTemplateModal, ConfirmJobModal, SecondVisitModal, CompleteJobModal } from "@/components/StageModals";
import { updateJobStage, deleteJob } from "@/app/actions/jobActions";
import { JOB_STAGES, getStageDisplay, getStageDB } from "@/lib/constants";

export type Job = {
  id: string;
  created_by: string;
  assigned_to: string | null;
  stage: string;
  customer_id: string | null;
  customers: {
    name: string;
    phone: string | null;
    address: string | null;
    unit_type?: string | null;
  } | null;
  service_type: string;
  ac_brand: string;
  unit_count: number;
  visit_date: string | null;
  visit_time: string | null;
  visit_phone: string | null;
  job_date: string | null;
  job_time: string | null;
  payment_status: string;
  notes: string;
  labor_cost: number;
  quoted_amount: number;
  material_cost?: number;
  priority: string;
  source: string;
  service_report_no: string | null;
  internal_notes: string | null;
  quoted_date: string | null;
  expiry_date: string | null;
  status: string;
  loss_reason: string | null;
  closed_at: string | null;
  created_at: string;
  deposit_amount?: number;
  deposit_collected?: number;
  cv_redeemed?: boolean;
  cv_amount?: number;
  final_payment_collected?: number;
  quotation_breakdown?: string | null;
  quotation_materials?: string | null;
  quotation_warranty?: string | null;
  engineer_name?: string | null;
  google_calendar_event_id?: string | null;
  visit_event_id?: string | null;
  job_event_id?: string | null;
  second_visit_event_id?: string | null;
  second_visit_date?: string | null;
  second_visit_time?: string | null;
};


export const STAGES = JOB_STAGES;
export const STAGE_DISPLAY: Record<string, string> = { "In Progress": "First Visit" };
export const getStageDisplayLocal = getStageDisplay;

export default function JobsClient({
  initialJobs,
  userId,
  role,
  staffProfiles,
  initialFilters,
  nextCursor,
}: {
  initialJobs: Job[];
  userId: string;
  role: "admin" | "staff";
  staffProfiles: { id: string; role: string; full_name?: string; email?: string }[];
  initialFilters: { q: string; service: string; tech: string; date_range: string; view: string };
  nextCursor: { created_at: string; id: string } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Delete confirmation state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // URL-driven filter state (initialised from server-side searchParams)
  const [searchTermRaw, setSearchTermRaw] = useState(initialFilters.q);
  const [serviceTypeFilter, setServiceTypeFilter] = useState(initialFilters.service);
  const [dateFilter, setDateFilter] = useState(initialFilters.date_range);
  const [techFilter, setTechFilter] = useState(initialFilters.tech);
  const [viewMode, setViewMode] = useState<"board" | "list">(initialFilters.view === "list" ? "list" : "board");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTerm = searchTermRaw;

  // Stage action modals
  const [pendingJob, setPendingJob] = useState<Job | null>(null);
  const [targetStage, setTargetStage] = useState<string>("");
  const [showSiteVisitModal, setShowSiteVisitModal] = useState(false);
  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [showWhatsAppTemplate, setShowWhatsAppTemplate] = useState(false);
  const [whatsappText, setWhatsappText] = useState("");
  const [showConfirmJobModal, setShowConfirmJobModal] = useState(false);
  const [showSecondVisitModal, setShowSecondVisitModal] = useState(false);
  const [showCompleteJobModal, setShowCompleteJobModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // ── URL-based filter helpers ──────────────────────────────────────────────
  const pushFilters = useCallback((overrides: Record<string, string>) => {
    const sp = new URLSearchParams({
      q:          searchTermRaw,
      service:    serviceTypeFilter,
      tech:       techFilter,
      date_range: dateFilter,
      view:       viewMode,
      ...overrides,
    });
    // Strip defaults to keep URLs clean
    ["q", "service", "tech", "date_range"].forEach(k => { if (sp.get(k) === "All" || sp.get(k) === "") sp.delete(k); });
    if (sp.get("view") === "board") sp.delete("view");
    router.push(`${pathname}?${sp.toString()}`);
  }, [searchTermRaw, serviceTypeFilter, techFilter, dateFilter, viewMode, pathname, router]);

  // Debounced search — waits 300ms after typing stops before pushing to URL
  const setSearchTerm = useCallback((val: string) => {
    setSearchTermRaw(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => pushFilters({ q: val }), 300);
  }, [pushFilters]);

  // Keep jobs in sync when server sends fresh data (after navigation)
  useEffect(() => { setJobs(initialJobs); }, [initialJobs]);

  const isWithinRange = (dateStr: string | null, range: string) => {
    if (!dateStr || range === "All") return true;
    const date = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (range === "Today") {
      const target = new Date(date);
      target.setHours(0, 0, 0, 0);
      return target.getTime() === now.getTime();
    }
    if (range === "This Week") {
      const diff = now.getTime() - date.getTime();
      return diff <= 7 * 24 * 60 * 60 * 1000 && diff >= 0;
    }
    if (range === "This Month") {
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }
    return true;
  };

  const normalizeStage = getStageDisplay;

  // Jobs are already server-filtered — no client-side filter loop needed.
  const filteredJobs = jobs;

  const advanceStageJobsClient = async (jobId: string, newStage: string, updates: any) => {
    setActionLoading(true);
    const dbStage = getStageDB(newStage);
    const finalUpdates = { stage: dbStage, ...updates };

    // Optimistic Update
    setJobs(jobs.map((j) => (j.id === jobId ? { ...j, ...finalUpdates } : j)));

    startTransition(async () => {
      const result = await updateJobStage(jobId, newStage, updates);
      if (result.error) {
        alert("Error updating job: " + result.error);
        router.refresh(); // rollback on error
      } else if (result.calendarError) {
        alert("Job updated, but Google Calendar sync failed: " + result.calendarError);
      }
      setActionLoading(false);
    });
  };

  const handleDragDrop = async (jobId: string, newStage: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    const currentIndex = JOB_STAGES.indexOf(normalizeStage(job.stage) as any);
    const newIndex = JOB_STAGES.indexOf(newStage as any);

    if (newIndex < currentIndex) {
      alert("Workflow restriction: Jobs cannot be moved backwards to a previous stage.");
      return;
    }

    if (newStage === "Site Visit Scheduled") {
      setPendingJob(job);
      setShowSiteVisitModal(true);
      return;
    }
    if (newStage === "Quotation Sent") {
      setPendingJob(job);
      setShowQuotationModal(true);
      return;
    }
    if (newStage === "Job Scheduled" || newStage === "First Visit") {
      setPendingJob(job);
      setTargetStage(newStage);
      setShowConfirmJobModal(true);
      return;
    }
    if (newStage === "Second Visit") {
      setPendingJob(job);
      setShowSecondVisitModal(true);
      return;
    }
    if (newStage === "Job Done (Payment Pending)" || newStage === "Completed") {
      setPendingJob(job);
      setTargetStage(newStage);
      setShowCompleteJobModal(true);
      return;
    }

    // Map "First Visit" back to DB value "In Progress" for now
    await advanceStageJobsClient(jobId, newStage, {});
  };

  const handleSiteVisitSubmit = async (updates: any) => {
    if (!pendingJob) return;
    await advanceStageJobsClient(pendingJob.id, "Site Visit Scheduled", updates);
    setShowSiteVisitModal(false);
    setPendingJob(null);
  };

  const handleQuotationSubmit = async (updates: any, wpText: string) => {
    if (!pendingJob) return;
    await advanceStageJobsClient(pendingJob.id, "Quotation Sent", updates);
    setWhatsappText(wpText);
    setShowQuotationModal(false);
    setShowWhatsAppTemplate(true);
  };

  const handleConfirmJobSubmit = async (updates: any) => {
    if (!pendingJob) return;
    await advanceStageJobsClient(pendingJob.id, targetStage || "Job Scheduled", updates);
    setShowConfirmJobModal(false);
    setPendingJob(null);
    setTargetStage("");
  };

  const handleSecondVisitSubmit = async (updates: any) => {
    if (!pendingJob) return;
    await advanceStageJobsClient(pendingJob.id, "Second Visit", updates);
    setShowSecondVisitModal(false);
    setPendingJob(null);
  };

  const handleCompleteJobSubmit = async (updates: any) => {
    if (!pendingJob) return;

    // Automatically move to "Completed" if user marked it as "Paid"
    let finalStage = targetStage || "Job Done (Payment Pending)";
    if (updates.payment_status === "Paid") {
      finalStage = "Completed";
    }

    await advanceStageJobsClient(pendingJob.id, finalStage, updates);
    setShowCompleteJobModal(false);
    setPendingJob(null);
    setTargetStage("");
  };


  const openNewJob = () => { setSelectedJob(null); setIsModalOpen(true); };

  const openJobDetail = (job: Job) => { router.push(`/dashboard/jobs/${job.id}`); };

  const handleSaveJob = (savedJob: Job) => {
    const isExisting = jobs.some((j) => j.id === savedJob.id);
    if (isExisting) setJobs(jobs.map((j) => (j.id === savedJob.id ? savedJob : j)));
    else setJobs([savedJob, ...jobs]);
    setIsModalOpen(false);
  };

  const requestDeleteJob = (job: Job) => {
    setJobToDelete(job);
    setShowDeleteModal(true);
  };

  const confirmDeleteJob = async () => {
    if (!jobToDelete) return;
    setDeleteLoading(true);

    const result = await deleteJob(jobToDelete.id);

    if (result.error) {
      alert("Error deleting job: " + result.error);
    } else {
      setJobs((prev) => prev.filter((j) => j.id !== jobToDelete.id));
    }
    setDeleteLoading(false);
    setShowDeleteModal(false);
    setJobToDelete(null);
  };

  return (
    <div style={isFullscreen ? {
      position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
      zIndex: 1000, background: "#f8fafc", display: "flex", flexDirection: "column", overflow: "hidden"
    } : {}}>
      {/* ── Header ── */}
      <div style={{
        padding: "20px 28px", borderBottom: "1px solid #e4e9f0", background: "#fff",
        display: "flex", flexDirection: "column", gap: 16, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 40, height: 40, background: "#eff6ff", borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#2563eb", flexShrink: 0, fontSize: 20,
            }}>📋</div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", margin: 0 }}>
                Jobs Pipeline {isFullscreen && <span style={{ fontSize: 11, background: "#f1f5f9", color: "#64748b", padding: "2px 8px", borderRadius: 4, verticalAlign: "middle", marginLeft: 8 }}>FULLSCREEN</span>}
              </h1>
              <p style={{ fontSize: 12.5, color: "#64748b", marginTop: 2 }}>
                {filteredJobs.length} {filteredJobs.length === 1 ? "job" : "jobs"} visible {searchTerm || serviceTypeFilter !== "All" || dateFilter !== "All" ? "(filtered)" : ""}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {/* View Switcher */}
            <div style={{ display: "inline-flex", background: "#f1f5f9", padding: "4px", borderRadius: "10px", marginRight: "8px" }}>
              <button onClick={() => setViewMode("board")} style={{
                padding: "6px 12px", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
                background: viewMode === "board" ? "#fff" : "transparent",
                color: viewMode === "board" ? "#0f172a" : "#64748b",
                boxShadow: viewMode === "board" ? "0 1px 2px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s"
              }}>🔲 Pipeline</button>
              <button onClick={() => setViewMode("list")} style={{
                padding: "6px 12px", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
                background: viewMode === "list" ? "#fff" : "transparent",
                color: viewMode === "list" ? "#0f172a" : "#64748b",
                boxShadow: viewMode === "list" ? "0 1px 2px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s"
              }}>☰ List View</button>
            </div>
            <button onClick={() => setIsFullscreen(!isFullscreen)} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "9px 12px",
              background: isFullscreen ? "#f1f5f9" : "#fff", color: "#4b5563",
              border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer"
            }}>
              {isFullscreen ? "Exit Fullscreen" : "Full Screen ⛶"}
            </button>
            <button onClick={openNewJob} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "10px 20px",
              background: "#0f172a", color: "#fff", border: "none", borderRadius: 8,
              fontSize: 13.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
            }}>+ Create Job</button>
          </div>
        </div>

        {/* Filter Bar */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, maxWidth: "300px" }}>
            <input
              placeholder="Search customers, brands, reports..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: "9px 12px 9px 36px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13.5, width: "100%", outline: "none" }}
            />
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>🔍</span>
          </div>
          <select value={serviceTypeFilter} onChange={(e) => { setServiceTypeFilter(e.target.value); pushFilters({ service: e.target.value }); }}
            style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13.5, background: "#fff" }}>
            <option value="All">All Services</option>
            <option value="Servicing">Servicing</option>
            <option value="Installation">Installation</option>
          </select>
          {role === "admin" && (
            <select value={techFilter} onChange={(e) => { setTechFilter(e.target.value); pushFilters({ tech: e.target.value }); }}
              style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13.5, background: "#fff" }}>
              <option value="All">All Technicians</option>
              {staffProfiles.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name || s.email}</option>
              ))}
            </select>
          )}
          <select value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); pushFilters({ date_range: e.target.value }); }}
            style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13.5, background: "#fff" }}>
            <option value="All">Any Time</option>
            <option value="Today">Today</option>
            <option value="This Week">Next 7 Days</option>
            <option value="This Month">This Month</option>
          </select>
          {(searchTerm || serviceTypeFilter !== "All" || dateFilter !== "All" || techFilter !== "All") && (
            <button onClick={() => { setSearchTermRaw(""); setServiceTypeFilter("All"); setDateFilter("All"); setTechFilter("All"); pushFilters({ q: "", service: "All", tech: "All", date_range: "All" }); }}
              style={{ background: "none", border: "none", color: "#3b82f6", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="dashboard-content" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: viewMode === "list" ? "24px 28px" : "24px 28px 0" }}>
        {viewMode === "board" ? (
          <div className="pipeline-container" style={{ flex: 1, height: "auto", maxHeight: "100%" }}>
            {JOB_STAGES.map((stage) => {
              const columnJobs = filteredJobs.filter((j) => normalizeStage(j.stage) === stage);
              return (
                <JobColumn
                  key={stage}
                  stage={stage}
                  jobs={columnJobs}
                  onJobClick={openJobDetail}
                  onDropJob={handleDragDrop}
                  onDeleteJob={requestDeleteJob}
                />
              );
            })}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
            <JobListView
              jobs={filteredJobs}
              onJobClick={openJobDetail}
              staffProfiles={staffProfiles}
            />
            {/* Keyset pagination controls */}
            {nextCursor && (
              <div style={{ display: "flex", justifyContent: "center", paddingBottom: 24 }}>
                <button
                  onClick={() => {
                    const sp = new URLSearchParams({
                      q: searchTerm, service: serviceTypeFilter, tech: techFilter,
                      date_range: dateFilter, view: "list",
                      cursor_created_at: nextCursor.created_at,
                      cursor_id: nextCursor.id,
                    });
                    router.push(`${pathname}?${sp.toString()}`);
                  }}
                  style={{ padding: "10px 28px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  Load Next Page →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {isModalOpen && (
        <JobModal
          job={selectedJob}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveJob}
          userId={userId}
          role={role}
          staffProfiles={staffProfiles}
        />
      )}

      {/* ══ SITE VISIT MODAL ══ */}
      {showSiteVisitModal && pendingJob && (
        <SiteVisitModal job={pendingJob} loading={actionLoading} onClose={() => setShowSiteVisitModal(false)} onSubmit={handleSiteVisitSubmit} />
      )}

      {/* ══ QUOTATION MODAL ══ */}
      {showQuotationModal && pendingJob && (
        <QuotationModal job={pendingJob} loading={actionLoading} onClose={() => setShowQuotationModal(false)} onSubmit={handleQuotationSubmit} />
      )}

      {/* ══ WHATSAPP TEMPLATE MODAL ══ */}
      {showWhatsAppTemplate && (
        <WhatsAppTemplateModal whatsappText={whatsappText} onClose={() => setShowWhatsAppTemplate(false)} />
      )}

      {/* ══ CONFIRM JOB MODAL ══ */}
      {showConfirmJobModal && pendingJob && (
        <ConfirmJobModal job={pendingJob} loading={actionLoading} onClose={() => setShowConfirmJobModal(false)} onSubmit={handleConfirmJobSubmit} />
      )}

      {/* ══ SECOND VISIT MODAL ══ */}
      {showSecondVisitModal && pendingJob && (
        <SecondVisitModal job={pendingJob} loading={actionLoading} onClose={() => setShowSecondVisitModal(false)} onSubmit={handleSecondVisitSubmit} />
      )}

      {/* ══ COMPLETE JOB MODAL ══ */}
      {showCompleteJobModal && pendingJob && (
        <CompleteJobModal job={pendingJob} loading={actionLoading} targetStage={targetStage} onClose={() => setShowCompleteJobModal(false)} onSubmit={handleCompleteJobSubmit} />
      )}


      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && jobToDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "20px", width: "100%", maxWidth: "420px", padding: "32px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", border: "1px solid #fecaca" }}>
            <div style={{ width: 48, height: 48, background: "#fef2f2", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 16 }}>🗑️</div>
            <h3 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", margin: "0 0 8px 0", letterSpacing: "-0.4px" }}>Delete Job?</h3>
            <p style={{ fontSize: "14px", color: "#64748b", lineHeight: 1.6, margin: "0 0 8px 0" }}>
              You are about to permanently delete the job for:
            </p>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", marginBottom: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{jobToDelete.customers?.name || "Unnamed Job"}</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{jobToDelete.service_type} • {jobToDelete.stage}</div>
            </div>
            <p style={{ fontSize: "13px", color: "#dc2626", fontWeight: 600, margin: "0 0 24px 0" }}>⚠ This action cannot be undone.</p>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => { setShowDeleteModal(false); setJobToDelete(null); }} disabled={deleteLoading}
                style={{ flex: 1, padding: "13px", background: "#f1f5f9", color: "#475569", borderRadius: 12, fontWeight: 700, border: "none", cursor: "pointer", fontSize: 14 }}>
                Cancel
              </button>
              <button onClick={confirmDeleteJob} disabled={deleteLoading}
                style={{ flex: 1, padding: "13px", background: "#ef4444", color: "#fff", borderRadius: 12, fontWeight: 700, border: "none", cursor: "pointer", fontSize: 14, opacity: deleteLoading ? 0.7 : 1 }}>
                {deleteLoading ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

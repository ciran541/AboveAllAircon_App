"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import JobColumn from "./JobColumn";
import JobListView from "./JobListView";
import JobModal from "./JobModal";
import { useRouter } from "next/navigation";

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
  } | null;
  service_type: string;
  ac_brand: string;
  unit_count: number;
  visit_date: string | null;
  job_date: string | null;
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
};

export const STAGES = [
  "New Enquiry",
  "Site Visit Scheduled",
  "Quotation Sent",
  "Job Scheduled",
  "In Progress",
  "Completed",
];

export default function JobsClient({
  initialJobs,
  userId,
  role,
  staffProfiles,
}: {
  initialJobs: Job[];
  userId: string;
  role: "admin" | "staff";
  staffProfiles: { id: string; role: string; full_name?: string; email?: string }[];
}) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("All");
  const [techFilter, setTechFilter] = useState("All");
  const [outcomeFilter, setOutcomeFilter] = useState("Actionable");
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Quick Date Entry States
  const [showDatePrompt, setShowDatePrompt] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{
    jobId: string;
    newStage: string;
    dateField: "visit_date" | "job_date";
    title: string;
  } | null>(null);
  const [dateInput, setDateInput] = useState("");

  const supabase = createClient();
  const router = useRouter();

  // Helper for date checks
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

  const filteredJobs = jobs.filter((j) => {
    const matchesSearch = 
      j.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      j.ac_brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      j.service_report_no?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesService = serviceTypeFilter === "All" || j.service_type === serviceTypeFilter;
    const matchesTech = techFilter === "All" || j.assigned_to === techFilter;
    const matchesDate = isWithinRange(j.visit_date || j.job_date, dateFilter);

    // Outcome Filtering
    let matchesOutcome = true;
    if (outcomeFilter === "Actionable") {
      matchesOutcome = j.status === 'open' || !j.status;
    } else if (outcomeFilter === "Won") {
      matchesOutcome = j.status === 'won';
    } else if (outcomeFilter === "Lost") {
      matchesOutcome = j.status === 'lost';
    }

    return matchesSearch && matchesService && matchesTech && matchesDate && matchesOutcome;
  });

  const [stageBlockMsg, setStageBlockMsg] = useState<string | null>(null);

  const handleDragDrop = async (jobId: string, newStage: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    // Validate required dates before allowing stage change
    if (newStage === 'Site Visit Scheduled' && !job.visit_date) {
      setPendingUpdate({
        jobId,
        newStage,
        dateField: 'visit_date',
        title: 'Set Visit Date'
      });
      setShowDatePrompt(true);
      return;
    }
    if ((newStage === 'Job Scheduled' || newStage === 'In Progress') && !job.job_date) {
      setPendingUpdate({
        jobId,
        newStage,
        dateField: 'job_date',
        title: 'Set Job Date'
      });
      setShowDatePrompt(true);
      return;
    }

    // Optimistic update
    setJobs(jobs.map((j) => (j.id === jobId ? { ...j, stage: newStage } : j)));

    // Save to server
    const { error } = await supabase
      .from("jobs")
      .update({ stage: newStage })
      .eq("id", jobId);

    if (error) {
      console.error("Error updating stage:", error);
      // Revert on error
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, stage: job.stage } : j));
    }
  };

  const handleDatePromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUpdate || !dateInput) return;
    const { jobId, newStage, dateField } = pendingUpdate;

    // Optimistic update
    setJobs(jobs.map((j) => (j.id === jobId ? { ...j, stage: newStage, [dateField]: dateInput } : j)));

    // Save to server
    const { error } = await supabase
      .from("jobs")
      .update({ 
        stage: newStage, 
        [dateField]: dateInput 
      })
      .eq("id", jobId);

    if (error) {
      alert("Error updating job: " + error.message);
      router.refresh();
    }

    setShowDatePrompt(false);
    setPendingUpdate(null);
    setDateInput("");
  };


  const openNewJob = () => {
    setSelectedJob(null);
    setIsModalOpen(true);
  };

  const openJobDetail = (job: Job) => {
    router.push(`/dashboard/jobs/${job.id}`);
  };

  const handleSaveJob = (savedJob: Job) => {
    const isExisting = jobs.some((j) => j.id === savedJob.id);
    if (isExisting) {
      setJobs(jobs.map((j) => (j.id === savedJob.id ? savedJob : j)));
    } else {
      setJobs([savedJob, ...jobs]);
    }
    setIsModalOpen(false);
  };

  return (
    <div style={isFullscreen ? {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 1000,
      background: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    } : {}}>
      <div style={{
        padding: '20px 28px',
        borderBottom: '1px solid #e4e9f0',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 40, height: 40,
              background: '#eff6ff',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#2563eb', flexShrink: 0, fontSize: 20,
            }}>
              📋
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px', margin: 0 }}>
                Jobs Pipeline {isFullscreen && <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 4, verticalAlign: 'middle', marginLeft: 8 }}>FULLSCREEN</span>}
              </h1>
              <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
                {filteredJobs.length} {filteredJobs.length === 1 ? 'job' : 'jobs'} visible {searchTerm || serviceTypeFilter !== "All" || dateFilter !== "All" ? "(filtered)" : ""}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {/* View Switcher */}
            <div style={{ 
              display: 'inline-flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', marginRight: '8px' 
            }}>
              <button
                onClick={() => setViewMode("board")}
                style={{
                  padding: '6px 12px', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                  background: viewMode === "board" ? "#fff" : "transparent",
                  color: viewMode === "board" ? "#0f172a" : "#64748b",
                  boxShadow: viewMode === "board" ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                  transition: 'all 0.2s'
                }}
              >
                🔲 Pipeline
              </button>
              <button
                onClick={() => setViewMode("list")}
                style={{
                  padding: '6px 12px', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                  background: viewMode === "list" ? "#fff" : "transparent",
                  color: viewMode === "list" ? "#0f172a" : "#64748b",
                  boxShadow: viewMode === "list" ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                  transition: 'all 0.2s'
                }}
              >
                ☰ List View
              </button>
            </div>

            <button
               onClick={() => setIsFullscreen(!isFullscreen)}
               style={{
                 display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px',
                 background: isFullscreen ? '#f1f5f9' : '#fff', color: '#4b5563',
                 border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer'
               }}
               title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
               {isFullscreen ? "Exit Fullscreen" : "Full Screen ⛶"}
            </button>
            <button
              onClick={openNewJob}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 20px',
                background: '#0f172a', color: '#fff',
                border: 'none', borderRadius: 8,
                fontSize: 13.5, fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              }}
            >
              + Create Job
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
            <input 
              placeholder="Search customers or brands..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ 
                padding: '9px 12px 9px 36px', borderRadius: 8, border: '1px solid #e2e8f0', 
                fontSize: 13.5, width: '100%', outline: 'none' 
              }}
            />
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>🔍</span>
          </div>

          <select 
            value={serviceTypeFilter}
            onChange={(e) => setServiceTypeFilter(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13.5, background: '#fff' }}
          >
            <option value="All">All Services</option>
            <option value="Servicing">Servicing</option>
            <option value="Repair">Repair</option>
            <option value="Installation">Installation</option>
            <option value="Chemical Wash">Chemical Wash</option>
            <option value="Chemical Overhaul">Chemical Overhaul</option>
            <option value="Gas Top-Up">Gas Top-Up</option>
            <option value="Dismantling">Dismantling</option>
          </select>

          {role === "admin" && (
            <select 
              value={techFilter}
              onChange={(e) => setTechFilter(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13.5, background: '#fff' }}
            >
              <option value="All">All Technicians</option>
              {staffProfiles.map(s => (
                <option key={s.id} value={s.id}>{s.full_name || s.email}</option>
              ))}
            </select>
          )}

          <select 
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13.5, background: '#fff' }}
          >
            <option value="All">Any Time</option>
            <option value="Today">Today</option>
            <option value="This Week">Next 7 Days</option>
            <option value="This Month">This Month</option>
          </select>

          <select 
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13.5, background: '#fff' }}
          >
            <option value="Actionable">Actionable Only</option>
            <option value="Won">Won (Closed)</option>
            <option value="Lost">Lost (Analysis)</option>
            <option value="All">All Histories</option>
          </select>

          {(searchTerm || serviceTypeFilter !== "All" || dateFilter !== "All" || techFilter !== "All" || outcomeFilter !== "Actionable") && (
            <button 
              onClick={() => {
                setSearchTerm("");
                setServiceTypeFilter("All");
                setDateFilter("All");
                setTechFilter("All");
                setOutcomeFilter("Actionable");
              }}
              style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="dashboard-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: viewMode === 'list' ? '24px 28px' : '24px 28px 0' }}>

        {/* Stage-change blocked notification */}
        {stageBlockMsg && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px',
            padding: '12px 18px', marginBottom: '16px',
            display: 'flex', alignItems: 'center', gap: '10px',
            fontSize: '13.5px', fontWeight: 600, color: '#dc2626'
          }}>
            {stageBlockMsg}
          </div>
        )}

        {viewMode === "board" ? (

          <div className="pipeline-container" style={{ flex: 1, height: 'auto', maxHeight: '100%' }}>
            {STAGES.map((stage) => {
              const columnJobs = filteredJobs.filter((j) => j.stage === stage);
              return (
                <JobColumn
                  key={stage}
                  stage={stage}
                  jobs={columnJobs}
                  onJobClick={openJobDetail}
                  onDropJob={handleDragDrop}
                />
              );
            })}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <JobListView 
              jobs={filteredJobs} 
              onJobClick={openJobDetail}
              staffProfiles={staffProfiles}
            />
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

      {/* QUICK DATE PROMPT MODAL */}
      {showDatePrompt && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1100, padding: '20px'
        }}>
          <div style={{
            background: '#fff', borderRadius: '24px', width: '100%', maxWidth: '380px',
            padding: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            border: '1px solid #e2e8f0'
          }}>
             <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginBottom: '8px', letterSpacing: '-0.4px' }}>
                {pendingUpdate?.title || 'Action Required'}
             </h3>
             <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px', lineHeight: 1.5 }}>
                A date is required before you can move this job to <strong>{pendingUpdate?.newStage}</strong>. Please set it below:
             </p>

             <form onSubmit={handleDatePromptSubmit}>
                <div style={{ marginBottom: '24px' }}>
                   <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
                      Select Date
                   </label>
                   <input 
                     type="date" 
                     required
                     className="form-input" 
                     value={dateInput}
                     onChange={(e) => setDateInput(e.target.value)}
                     style={{ width: '100%', fontSize: '15px' }}
                   />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                   <button 
                     type="button"
                     onClick={() => { setShowDatePrompt(false); setPendingUpdate(null); setDateInput(""); }}
                     style={{ flex: 1, padding: '12px', background: '#f1f5f9', color: '#475569', borderRadius: '12px', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                   >
                     Cancel
                   </button>
                   <button 
                     type="submit"
                     style={{ flex: 1, padding: '12px', background: '#0f172a', color: '#fff', borderRadius: '12px', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                   >
                     Confirm & Move
                   </button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}

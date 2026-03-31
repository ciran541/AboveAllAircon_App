"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import JobColumn from "./JobColumn";
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

  const supabase = createClient();
  const router = useRouter();

  const handleDragDrop = async (jobId: string, newStage: string) => {
    // Optimistic update
    setJobs(jobs.map((j) => (j.id === jobId ? { ...j, stage: newStage } : j)));

    // Save to server
    const { error } = await supabase
      .from("jobs")
      .update({ stage: newStage })
      .eq("id", jobId);

    if (error) {
      console.error("Error updating stage:", error);
      // Revert on error could be implemented here
    }
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
    <>
      <div style={{
        padding: '16px 28px',
        borderBottom: '1px solid #e4e9f0',
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexShrink: 0,
      }}>
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
            <h1 style={{ fontSize: 17, fontWeight: 700, color: '#111827', letterSpacing: '-0.3px' }}>
              Jobs Pipeline
            </h1>
            <p style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 2 }}>
              {jobs.length} total job{jobs.length !== 1 ? 's' : ''} across all stages
            </p>
          </div>
        </div>
        <button
          onClick={openNewJob}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px',
            background: '#2563eb', color: '#fff',
            border: 'none', borderRadius: 8,
            fontSize: 13.5, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            whiteSpace: 'nowrap', flexShrink: 0,
            boxShadow: '0 1px 3px rgba(37,99,235,0.3)',
          }}
        >
          + New Job
        </button>
      </div>

      <div className="dashboard-content">
        <div className="pipeline-container">
          {STAGES.map((stage) => {
            const columnJobs = jobs.filter((j) => j.stage === stage);
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
    </>
  );
}

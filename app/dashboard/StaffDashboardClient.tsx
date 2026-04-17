"use client";

import { useState } from "react";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { updateJobStage } from "@/app/actions/jobActions";

export default function StaffDashboardClient({ initialJobs, todayStr }: { initialJobs: any[], todayStr: string }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const router = useRouter();

  // Helper arrays
  const todaysJobs = jobs.filter((j) => j.job_date === todayStr && j.stage !== 'Completed' && j.stage !== 'Loss (Analysis)' && j.status !== 'won' && j.status !== 'lost');
  
  const overdueJobs = jobs.filter((j) => {
    if (j.stage === 'Completed' || j.stage === 'Loss (Analysis)' || j.status === 'won' || j.status === 'lost') return false;
    // Overdue definition:
    // If it's a site visit, check visit_date
    if (j.stage === 'Site Visit Scheduled' && j.visit_date && j.visit_date < todayStr) return true;
    // Otherwise check job_date
    if (j.job_date && j.job_date < todayStr) return true;
    return false;
  });

  const upcomingJobs = jobs.filter((j) => (j.job_date || '') > todayStr && j.stage !== 'Completed' && j.stage !== 'Loss (Analysis)' && j.status !== 'won' && j.status !== 'lost');

  // Action Handlers
  const handleUpdateStage = async (id: string, newStage: string) => {
    setLoadingId(id);
    const result = await updateJobStage(id, newStage);
    if (!result.error) {
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, stage: newStage } : j)));
      router.refresh();
    } else {
      alert("Error updating job schedule: " + result.error);
    }
    setLoadingId(null);
  };

  const handleMarkCompleted = async (id: string) => {
    setLoadingId(id);
    // Mark as completed sets both stage and status
    const result = await updateJobStage(id, 'Completed', { status: 'won' });
    if (!result.error) {
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, stage: 'Completed', status: 'won' } : j)));
      router.refresh();
    } else {
      alert("Error completing job: " + result.error);
    }
    setLoadingId(null);
  };

  const JobCard = ({ job, isOverdue }: { job: any, isOverdue?: boolean }) => {
    const isToday = job.job_date === todayStr;

    return (
      <div style={{
        background: '#fff', border: isOverdue ? '1px solid #fca5a5' : '1px solid #e2e8f0', borderRadius: '16px',
        padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '16px'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{job.customers?.name || 'Unknown Customer'}</div>
            <div style={{ fontSize: '14px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              {job.customers?.address || 'No Address'}
            </div>
            {isOverdue && (
              <div style={{ display: 'inline-block', marginTop: '8px', padding: '2px 8px', background: '#fef2f2', color: '#dc2626', fontSize: '11px', fontWeight: 800, borderRadius: '4px', textTransform: 'uppercase' }}>
                OVERDUE: {job.stage === 'Site Visit Scheduled' ? job.visit_date : job.job_date}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '4px 10px', borderRadius: '8px', display: 'inline-block', textTransform: 'uppercase' }}>
              {job.service_type}
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#475569', marginTop: '8px' }}>
              ${Number(job.quoted_amount || 0).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Details & Notes */}
        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', fontSize: '13.5px', color: '#334155' }}>
          <div style={{ display: 'flex', gap: '8px', fontWeight: 600, marginBottom: '8px', color: '#0f172a' }}>
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
             Current Stage: {job.stage}
          </div>
          {job.notes ? job.notes : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No public notes provided.</span>}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: 'auto', paddingTop: '8px' }}>
          {job.stage === 'Job Scheduled' && (
             <button 
               onClick={() => handleUpdateStage(job.id, 'In Progress')}
               disabled={loadingId === job.id}
               style={{ flex: 1, padding: '12px', background: '#2563eb', color: '#fff', borderRadius: '10px', fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
             >
               {loadingId === job.id ? 'Updating...' : 'Start Job'}
             </button>
          )}

          {job.stage === 'In Progress' && (
             <button 
               onClick={() => handleMarkCompleted(job.id)}
               disabled={loadingId === job.id}
               style={{ flex: 1, padding: '12px', background: '#10b981', color: '#fff', borderRadius: '10px', fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
             >
               {loadingId === job.id ? 'Updating...' : 'Mark Completed'}
             </button>
          )}

          <Link href={`/dashboard/jobs/${job.id}`} style={{ 
            flex: (job.stage === 'Job Scheduled' || job.stage === 'In Progress') ? 0 : 1, 
            padding: '12px 24px', background: '#f1f5f9', color: '#475569', borderRadius: '10px', fontWeight: 700, textDecoration: 'none', textAlign: 'center', transition: 'all 0.2s', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', alignItems: 'center'
          }}>
            View Details
          </Link>
        </div>
      </div>
    );
  };

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', padding: '40px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px', marginBottom: '8px' }}>
        My Dashboard
      </h1>
      <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '32px' }}>
        Your personal operational dispatch and workload overview.
      </p>

      {/* OVERDUE ALERTS */}
      {overdueJobs.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            Action Required: Overdue Tasks
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' }}>
            {overdueJobs.map((job) => (
              <JobCard key={job.id} job={job} isOverdue={true} />
            ))}
          </div>
        </div>
      )}

      {/* TODAY'S DISPATCH */}
      <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>
        Today's Dispatch ({todaysJobs.length})
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        {todaysJobs.length === 0 ? (
           <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', color: '#64748b' }}>
             No jobs scheduled for today. You're all caught up!
           </div>
        ) : (
          todaysJobs.map((job) => <JobCard key={job.id} job={job} />)
        )}
      </div>

      {/* UPCOMING JOBS */}
      <div style={{ marginTop: '40px' }}>
         <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>Upcoming Scheduled Jobs</h2>
         <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden' }}>
           {upcomingJobs.length === 0 ? (
             <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>No upcoming future jobs scheduled.</div>
           ) : (
             upcomingJobs.map((job, idx) => (
               <div key={job.id} style={{ padding: '16px 24px', borderBottom: idx < upcomingJobs.length - 1 ? '1px solid #f1f5f9' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <div>
                   <div style={{ fontWeight: 700, color: '#1e293b' }}>{(job.customers as any)?.name}</div>
                   <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{job.service_type} • Scheduled: {job.job_date || 'TBD'}</div>
                 </div>
                 <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                   <div style={{ fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', background: '#f1f5f9', color: '#475569' }}>{job.stage}</div>
                   <Link href={`/dashboard/jobs/${job.id}`} style={{ textDecoration: 'none', color: '#2563eb', fontSize: '13px', fontWeight: 600 }}>View →</Link>
                 </div>
               </div>
             ))
           )}
         </div>
         <div style={{ marginTop: '24px' }}>
           <Link href="/dashboard/jobs" style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 18px', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '8px', textDecoration: 'none', fontSize: '13.5px', fontWeight: 700 }}>
              View Full Pipeline
           </Link>
         </div>
      </div>
    </div>
  );
}

"use client";

import { Job, STAGES } from "./JobsClient";

export default function JobListView({
  jobs,
  onJobClick,
  staffProfiles
}: {
  jobs: Job[];
  onJobClick: (job: Job) => void;
  staffProfiles: { id: string; role: string; full_name?: string; name?: string; email?: string }[];
}) {
  return (
    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Customer</th>
            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Job Detail</th>
            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Stage</th>
            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Priority</th>
            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Technician</th>
            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Planned Date</th>
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                No jobs found matching your filters.
              </td>
            </tr>
          ) : (
            jobs.map(job => {
              const staff = staffProfiles.find(s => s.id === job.assigned_to);
              const staffName = (staff ? (staff.full_name || staff.name || staff.email) : 'Unassigned') || 'Unassigned';
              
              return (
                <tr 
                  key={job.id} 
                  onClick={() => onJobClick(job)}
                  style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s' }}
                  className="list-row-hover"
                >
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{job.customers?.name || 'Unknown'}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{job.customers?.phone || ''}</div>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>{job.ac_brand}</span>
                      <span style={{ fontSize: '11px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#64748b' }}>{job.unit_count} Units</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{job.service_type}</div>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ 
                      fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px',
                      background: job.stage === 'Completed' ? '#dcfce7' : '#eff6ff',
                      color: job.stage === 'Completed' ? '#166534' : '#2563eb',
                      textTransform: 'uppercase'
                    }}>
                      {job.stage}
                    </span>
                    {job.status && job.status !== 'open' && (
                      <span style={{ 
                        marginLeft: '8px', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                        background: job.status === 'won' ? '#f0fdf4' : '#fef2f2',
                        color: job.status === 'won' ? '#16a34a' : '#dc2626',
                        border: `1px solid ${job.status === 'won' ? '#bbf7d0' : '#fecaca'}`,
                        textTransform: 'uppercase'
                      }}>
                        {job.status}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ 
                      fontSize: '12px', fontWeight: 600, 
                      color: job.priority === 'Urgent' ? '#ef4444' : (job.priority === 'High' ? '#f59e0b' : '#64748b')
                    }}>
                      {job.priority}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#64748b' }}>
                        {(staffName[0] || 'U').toUpperCase()}
                      </div>
                      <span style={{ fontSize: '13px', color: '#334155' }}>{staffName}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{job.job_date || job.visit_date || 'TBD'}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Scheduled</div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      <style jsx>{`
        .list-row-hover:hover {
          background-color: #fbfcfe !important;
        }
      `}</style>
    </div>
  );
}

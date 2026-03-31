"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const STAGES = [
  "New Enquiry",
  "Site Visit Scheduled",
  "Quotation Sent",
  "Job Scheduled",
  "In Progress",
  "Completed",
];

const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const SOURCES = ["WhatsApp", "Call", "Referral", "Website", "Facebook", "Other"];

export default function JobDetailClient({ 
  initialJob, 
  initialMaterials, 
  staffProfiles 
}: { 
  initialJob: any; 
  initialMaterials: any[];
  staffProfiles: any[];
}) {
  const [job, setJob] = useState(initialJob);
  const [materials, setMaterials] = useState(initialMaterials);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Failsafe: If assigned_staff is missing but assigned_to exists, try to find it in staffProfiles
  if (!job.assigned_staff && job.assigned_to && staffProfiles.length > 0) {
    const found = staffProfiles.find(s => s.id === job.assigned_to);
    if (found) {
       // We update the state once if needed to ensure UI is consistent
       // But wait, we can just use the 'found' variable in our render fallback instead of causing a re-render loop
    }
  }

  const handleUpdateStage = async (newStage: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('jobs')
      .update({ stage: newStage })
      .eq('id', job.id)
      .select()
      .single();
    
    if (!error && data) {
      setJob({ ...job, ...data });
    }
    setLoading(false);
  };

  const handleSaveFields = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const updates = {
      service_type: formData.get('service_type'),
      ac_brand: formData.get('ac_brand'),
      unit_count: parseInt(formData.get('unit_count') as string) || 0,
      priority: formData.get('priority'),
      source: formData.get('source'),
      service_report_no: formData.get('service_report_no'),
      internal_notes: formData.get('internal_notes'),
      labor_cost: parseFloat(formData.get('labor_cost') as string) || 0,
      quoted_amount: parseFloat(formData.get('quoted_amount') as string) || 0,
      assigned_to: formData.get('assigned_to') || null,
      visit_date: formData.get('visit_date') || null,
      job_date: formData.get('job_date') || null,
      notes: formData.get('notes'),
    };

    const { data, error } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', job.id)
      .select()
      .single();

    if (!error && data) {
      // Find the profile name in staffProfiles to update the UI immediately
      const newStaff = staffProfiles.find(s => s.id === (data as any).assigned_to);
      setJob({ 
        ...job, 
        ...data,
        assigned_staff: newStaff || null 
      });
      setIsEditing(false);
    } else {
      alert(error?.message);
    }
    setLoading(false);
  };

  const stageIndex = STAGES.indexOf(job.stage);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* --- HEADER SECTION --- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
             <span style={{ fontSize: '12px', fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '4px 10px', borderRadius: '6px', textTransform: 'uppercase' }}>
               Job #{job.id.substring(0, 8)}
             </span>
             <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>•</span>
             <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Created {new Date(job.created_at).toLocaleDateString()}</span>
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.8px', margin: 0 }}>
            {job.customers?.name || 'Unnamed Job'}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={() => setIsEditing(!isEditing)}
            style={{ 
              padding: '10px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', 
              fontSize: '14px', fontWeight: 600, color: '#475569', cursor: 'pointer' 
            }}
          >
            {isEditing ? 'Cancel' : 'Edit Details'}
          </button>
          {!isEditing && (
            <button 
              style={{ 
                padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#ef4444', 
                fontSize: '14px', fontWeight: 600, color: '#fff', cursor: 'pointer' 
              }}
              onClick={async () => {
                if(confirm('Delete this job?')) {
                  await supabase.from('jobs').delete().eq('id', job.id);
                  router.push('/dashboard/jobs');
                }
              }}
            >
              Delete Job
            </button>
          )}
        </div>
      </div>

      {/* --- TIMELINE SECTION --- */}
      <div style={{ background: '#fff', padding: '32px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '32px' }}>
          {STAGES.map((s, idx) => {
            const isCompleted = idx < stageIndex;
            const isCurrent = idx === stageIndex;
            return (
              <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                {idx < STAGES.length - 1 && (
                  <div style={{ 
                    position: 'absolute', top: '15px', left: '60%', width: '80%', height: '2px', 
                    background: idx < stageIndex ? '#22c55e' : '#e2e8f0', zIndex: 0 
                  }}></div>
                )}
                <button
                  onClick={() => handleUpdateStage(s)}
                  disabled={loading}
                  style={{ 
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: isCompleted ? '#22c55e' : (isCurrent ? '#3b82f6' : '#fff'),
                    border: isCurrent || isCompleted ? 'none' : '2px solid #e2e8f0',
                    color: isCurrent || isCompleted ? '#fff' : '#cbd5e1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', cursor: 'pointer', zIndex: 1, transition: 'all 0.2s'
                  }}
                >
                  {isCompleted ? '✓' : idx + 1}
                </button>
                <div style={{ marginTop: '12px', fontSize: '11px', fontWeight: 700, color: isCurrent ? '#0f172a' : '#64748b', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.4px', maxWidth: '80px' }}>
                  {s}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSaveFields} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
         
         {/* --- COLUMN 1: CUSTOMER & SERVICE --- */}
         <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="card-custom" style={{ padding: '24px', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
               <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer Profile</h3>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Name</div>
                    <Link href={`/dashboard/customers/${job.customer_id}`} style={{ fontSize: '16px', fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
                      {job.customers?.name}
                    </Link>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Contact</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#475569' }}>{job.customers?.phone || 'N/A'}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>{job.customers?.email || ''}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Address</div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: '#475569', lineHeight: 1.5 }}>{job.customers?.address || 'N/A'}</div>
                  </div>
               </div>
            </div>

            <div className="card-custom" style={{ padding: '24px', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
               <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Service Details</h3>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Service Type</div>
                    {isEditing ? (
                      <select name="service_type" defaultValue={job.service_type} className="form-input">
                        <option value="Servicing">Servicing</option>
                        <option value="Repair">Repair</option>
                        <option value="Installation">Installation</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: '14px', fontWeight: 700, background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '6px' }}>{job.service_type}</span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>AC Unit Info</div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        {isEditing ? (
                          <input name="ac_brand" defaultValue={job.ac_brand} placeholder="Brand" className="form-input" />
                        ) : (
                          <div style={{ fontSize: '14px', fontWeight: 600 }}>{job.ac_brand || 'TBD'}</div>
                        )}
                      </div>
                      <div style={{ width: '80px' }}>
                        {isEditing ? (
                          <input type="number" name="unit_count" defaultValue={job.unit_count} className="form-input" />
                        ) : (
                          <div style={{ fontSize: '14px', fontWeight: 600 }}>{job.unit_count} Unit(s)</div>
                        )}
                      </div>
                    </div>
                  </div>
               </div>
            </div>
         </div>

         {/* --- COLUMN 2: CRM & PLANNING --- */}
         <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="card-custom" style={{ padding: '24px', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
               <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>CRM & Tracking</h3>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Priority</div>
                      {isEditing ? (
                        <select name="priority" defaultValue={job.priority} className="form-input">
                          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      ) : (
                        <span style={{ 
                          fontSize: '12px', fontWeight: 800, 
                          color: job.priority === 'Urgent' ? '#ef4444' : (job.priority === 'High' ? '#f59e0b' : '#3b82f6'),
                          textTransform: 'uppercase'
                        }}>{job.priority}</span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Source</div>
                      {isEditing ? (
                        <select name="source" defaultValue={job.source} className="form-input">
                          {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>{job.source}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Service Report #</div>
                    {isEditing ? (
                      <input name="service_report_no" defaultValue={job.service_report_no} className="form-input" />
                    ) : (
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>{job.service_report_no || 'NOT FILED'}</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Internal Notes</div>
                    {isEditing ? (
                      <textarea name="internal_notes" defaultValue={job.internal_notes} rows={2} className="form-input" />
                    ) : (
                      <div style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>{job.internal_notes || 'No internal notes found.'}</div>
                    )}
                  </div>
               </div>
            </div>

            <div className="card-custom" style={{ padding: '24px', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
               <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Job Assignment</h3>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Assigned Staff</div>
                    {isEditing ? (
                      <select name="assigned_to" defaultValue={job.assigned_to} className="form-input">
                        <option value="">Unassigned</option>
                        {staffProfiles.map(s => <option key={s.id} value={s.id}>{s.full_name || s.name || s.email}</option>)}
                      </select>
                    ) : (() => {
                      const resolvedStaff = job.assigned_staff || staffProfiles.find((s: any) => s.id === job.assigned_to);
                      const name = resolvedStaff ? (resolvedStaff.full_name || resolvedStaff.name || resolvedStaff.email) : null;
                      const initials = (name || 'U').substring(0,1).toUpperCase();
                      
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#475569', border: '1px solid #e2e8f0' }}>
                            {initials}
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                            {name || (job.assigned_to ? `Assigned (ID: ${job.assigned_to.substring(0,8)})` : 'Unassigned')}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Visit Date</div>
                      {isEditing ? (
                        <input type="date" name="visit_date" defaultValue={job.visit_date} className="form-input" />
                      ) : (
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{job.visit_date || 'TBD'}</div>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Job Date</div>
                      {isEditing ? (
                        <input type="date" name="job_date" defaultValue={job.job_date} className="form-input" />
                      ) : (
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{job.job_date || 'TBD'}</div>
                      )}
                    </div>
                  </div>
               </div>
            </div>
         </div>

         {/* --- COLUMN 3: FINANCIALS & MATERIALS --- */}
         <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="card-custom" style={{ padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
               <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Financial Overview</h3>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#64748b' }}>Quoted Amount</span>
                    {isEditing ? (
                      <input name="quoted_amount" defaultValue={job.quoted_amount} style={{ width: '80px', textAlign: 'right' }} className="form-input" />
                    ) : (
                      <span style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>${Number(job.quoted_amount).toFixed(2)}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#64748b' }}>Labor Cost</span>
                    {isEditing ? (
                      <input name="labor_cost" defaultValue={job.labor_cost} style={{ width: '80px', textAlign: 'right' }} className="form-input" />
                    ) : (
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#475569' }}>${Number(job.labor_cost).toFixed(2)}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#64748b' }}>Material Cost</span>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#475569' }}>${Number(job.material_cost || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ margin: '12px 0', height: '1px', background: '#e2e8f0' }}></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Net Profit</span>
                    <span style={{ 
                      fontSize: '20px', fontWeight: 900, 
                      color: (job.quoted_amount - job.labor_cost - (job.material_cost || 0)) >= 0 ? '#10b981' : '#ef4444' 
                    }}>
                      ${(job.quoted_amount - job.labor_cost - (job.material_cost || 0)).toFixed(2)}
                    </span>
                  </div>
               </div>
               {isEditing && (
                 <button type="submit" disabled={loading} style={{ width: '100%', marginTop: '24px', padding: '12px', background: '#0f172a', color: '#fff', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                   {loading ? 'Saving...' : 'Save All Changes'}
                 </button>
               )}
            </div>

            <div className="card-custom" style={{ padding: '24px', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
               <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Materials Inventory</h3>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {materials.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                      No materials logged for this job.
                    </div>
                  ) : (
                    materials.map(m => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '10px' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{m.inventory_items?.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Qty: {m.quantity_used} {m.inventory_items?.unit}</div>
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>
                          ${(m.price_at_time * m.quantity_used).toFixed(2)}
                        </div>
                      </div>
                    ))
                  )}
               </div>
            </div>
         </div>
      </form>

      {/* --- PUBLIC NOTES SECTION --- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
         <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Public Service Notes</h3>
         <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            {isEditing ? (
              <textarea name="notes" defaultValue={job.notes} rows={4} className="form-input" style={{ width: '100%' }} />
            ) : (
              <p style={{ margin: 0, fontSize: '15px', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{job.notes || 'No public notes provided.'}</p>
            )}
         </div>
      </div>

    </div>
  );
}

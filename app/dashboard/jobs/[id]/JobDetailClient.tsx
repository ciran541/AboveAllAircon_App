"use client";

import { useState, useEffect } from "react";
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
  staffProfiles,
  userRole
}: { 
  initialJob: any; 
  initialMaterials: any[];
  staffProfiles: any[];
  userRole?: string;
}) {
  const [job, setJob] = useState(initialJob);
  const [materials, setMaterials] = useState(initialMaterials);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [showLossModal, setShowLossModal] = useState(false);
  const [lossReasonPreset, setLossReasonPreset] = useState('');
  const [lossReasonCustom, setLossReasonCustom] = useState('');

  // Quick Date Entry States
  const [showDatePrompt, setShowDatePrompt] = useState(false);
  const [datePromptConfig, setDatePromptConfig] = useState<{
    targetStage: string;
    dateField: "visit_date" | "job_date";
    title: string;
  } | null>(null);
  const [dateInput, setDateInput] = useState("");
  // Material management on detail page
  const [inventory, setInventory] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [useQty, setUseQty] = useState('');
  const [matLoading, setMatLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const MATERIAL_STAGES = ['Job Scheduled', 'In Progress', 'Completed'];
  const canLogMaterials = MATERIAL_STAGES.includes(job.stage);

  // Fetch inventory when stage allows material logging
  useEffect(() => {
    if (canLogMaterials) {
      supabase
        .from('inventory_items')
        .select('id, name, unit, stock_quantity, unit_cost, unit_price')
        .order('name')
        .then(({ data }) => { if (data) setInventory(data); });
    }
  }, [job.stage]);

  const LOSS_REASONS = [
    'Price too high',
    'No response from customer',
    'Customer went with competitor',
    'Job cancelled by customer',
    'Out of service area',
    'Other',
  ];

  const handleConfirmLost = async () => {
    const finalReason = (lossReasonPreset === 'Other' ? lossReasonCustom.trim() : lossReasonPreset) || lossReasonCustom.trim();
    if (!finalReason) return;
    await handleUpdateStatus('lost', finalReason);
    setShowLossModal(false);
    setLossReasonPreset('');
    setLossReasonCustom('');
  };

  const handleAddMaterial = async () => {
    if (!selectedItem || !useQty) return;
    const qty = parseInt(useQty);
    if (isNaN(qty) || qty <= 0) return;
    const item = inventory.find(i => i.id === selectedItem);
    if (!item) return;
    if (item.stock_quantity < qty) {
      alert(`Insufficient stock — only ${item.stock_quantity} ${item.unit} available.`);
      return;
    }
    setMatLoading(true);
    const { data, error } = await supabase
      .from('job_materials')
      .insert([{
        job_id: job.id,
        item_id: item.id,
        quantity_used: qty,
        created_by: job.created_by,
        cost_at_time: item.unit_cost || 0,
        price_at_time: item.unit_price || 0,
      }])
      .select('id, item_id, quantity_used, cost_at_time, price_at_time')
      .single();
    if (!error && data) {
      const newMat = { ...data, inventory_items: { name: item.name, unit: item.unit } };
      setMaterials(prev => [...prev, newMat]);
      setInventory(prev => prev.map(i => i.id === selectedItem ? { ...i, stock_quantity: i.stock_quantity - qty } : i));
      setSelectedItem('');
      setUseQty('');
    } else if (error) {
      alert('Error adding material: ' + error.message);
    }
    setMatLoading(false);
  };

  const handleRemoveMaterial = async (matId: string, itemId: string, qty: number) => {
    if (!confirm('Remove this material? Stock will be returned to inventory.')) return;
    const { error } = await supabase.from('job_materials').delete().eq('id', matId);
    if (!error) {
      setMaterials(prev => prev.filter(m => m.id !== matId));
      setInventory(prev => prev.map(i => i.id === itemId ? { ...i, stock_quantity: i.stock_quantity + qty } : i));
    }
  };


  if (!job.assigned_staff && job.assigned_to && staffProfiles.length > 0) {
    const found = staffProfiles.find(s => s.id === job.assigned_to);
    if (found) {
       // We update the state once if needed to ensure UI is consistent
       // But wait, we can just use the 'found' variable in our render fallback instead of causing a re-render loop
    }
  }

  const handleUpdateStage = async (newStage: string) => {
    // Validate required dates before allowing stage change
    if (newStage === 'Site Visit Scheduled' && !job.visit_date) {
      setDatePromptConfig({
        targetStage: newStage,
        dateField: 'visit_date',
        title: 'Set Visit Date'
      });
      setShowDatePrompt(true);
      return;
    }
    if ((newStage === 'Job Scheduled' || newStage === 'In Progress') && !job.job_date) {
      setDatePromptConfig({
        targetStage: newStage,
        dateField: 'job_date',
        title: 'Set Job Date'
      });
      setShowDatePrompt(true);
      return;
    }
    setStageError(null);
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

  const handleDatePromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!datePromptConfig || !dateInput) return;
    const { targetStage, dateField } = datePromptConfig;

    setLoading(true);
    const { data, error } = await supabase
      .from('jobs')
      .update({ 
        stage: targetStage, 
        [dateField]: dateInput 
      })
      .eq('id', job.id)
      .select()
      .single();

    if (!error && data) {
      setJob({ ...job, ...data });
      setShowDatePrompt(false);
      setDatePromptConfig(null);
      setDateInput("");
    } else if (error) {
       alert("Error: " + error.message);
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

    if (userRole === 'admin') {
      const formPaymentStatus = formData.get('payment_status');
      if (formPaymentStatus) {
        (updates as any).payment_status = formPaymentStatus;
        if (formPaymentStatus === 'Paid' && job.payment_status !== 'Paid') {
          (updates as any).payment_collected_at = new Date().toISOString();
        } else if (formPaymentStatus === 'Pending' && job.payment_status === 'Paid') {
          (updates as any).payment_collected_at = null;
        }
      }
    }

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

  const handleUpdateStatus = async (newStatus: string, reason?: string) => {
    setLoading(true);
    const updates: any = { 
       status: newStatus,
       closed_at: newStatus === 'open' ? null : new Date().toISOString()
    };
    if (reason) updates.loss_reason = reason;
    if (newStatus === 'won') updates.stage = 'Completed';

    const { data, error } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', job.id)
      .select()
      .single();
    
    if (!error && data) {
      setJob({ ...job, ...data });
    } else if (error) {
       console.error("Failed to update job status:", error.message);
       alert("Error: " + error.message + "\n\nNote: You might need to add the 'status' column to the database via SQL first.");
    }
    setLoading(false);
  };

  const stageIndex = STAGES.indexOf(job.stage);

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* --- STATUS BANNERS --- */}
      {job.status === 'won' && (
        <div style={{ 
          background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 24px', borderRadius: '12px',
          display: 'flex', alignItems: 'center', gap: '12px', color: '#16a34a', fontWeight: 700 
        }}>
          <span style={{ fontSize: '20px' }}>🏆</span>
          <div>
            <div style={{ fontSize: '15px' }}>Job Won & Closed</div>
            <div style={{ fontSize: '12px', opacity: 0.8, fontWeight: 500 }}>Successfully completed on {new Date(job.closed_at).toLocaleDateString()}</div>
          </div>
        </div>
      )}

      {job.status === 'lost' && (
        <div style={{ 
          background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 24px', borderRadius: '12px',
          display: 'flex', alignItems: 'center', gap: '12px', color: '#dc2626', fontWeight: 700 
        }}>
          <span style={{ fontSize: '20px' }}>⛔</span>
          <div>
            <div style={{ fontSize: '15px' }}>Lead Lost</div>
            <div style={{ fontSize: '12px', opacity: 0.8, fontWeight: 500 }}>Reason: {job.loss_reason || 'N/A'} • {new Date(job.closed_at).toLocaleDateString()}</div>
          </div>
          <button 
            onClick={() => handleUpdateStatus('open')}
            style={{ marginLeft: 'auto', background: '#fff', border: '1px solid #fecaca', color: '#dc2626', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
          >
            Reopen Lead
          </button>
        </div>
      )}

      {/* --- HEADER SECTION --- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
             <span style={{ fontSize: '12px', fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '4px 10px', borderRadius: '6px', textTransform: 'uppercase' }}>
               Job #{job.id.substring(0, 8)}
             </span>
             {(!job.status || job.status === 'open') && (
               <span style={{ fontSize: '10px', fontWeight: 800, color: '#f59e0b', border: '1.5px solid #f59e0b', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Lead</span>
             )}
             <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>•</span>
             <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Created {new Date(job.created_at).toLocaleDateString()}</span>
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.8px', margin: 0 }}>
            {job.customers?.name || 'Unnamed Job'}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {(!job.status || job.status === 'open') && (
            <>
              <button 
                onClick={() => handleUpdateStatus('won')}
                style={{ 
                  padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#10b981', 
                  fontSize: '14px', fontWeight: 600, color: '#fff', cursor: 'pointer' 
                }}
              >
                Mark as Won
              </button>
              <button 
                onClick={() => { setLossReasonPreset(''); setLossReasonCustom(''); setShowLossModal(true); }}
                style={{ 
                  padding: '10px 20px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fef2f2', 
                  fontSize: '14px', fontWeight: 600, color: '#dc2626', cursor: 'pointer' 
                }}
              >
                Mark as Lost
              </button>
            </>
          )}
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

                  {userRole === 'admin' ? (
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Payment Status</span>
                        {isEditing ? (
                          <select name="payment_status" defaultValue={job.payment_status || 'Pending'} className="form-input" style={{ width: '120px' }}>
                            <option value="Pending">Pending</option>
                            <option value="Paid">Paid</option>
                          </select>
                        ) : (
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ 
                               fontSize: '12px', fontWeight: 700, padding: '4px 8px', borderRadius: '6px',
                               background: job.payment_status === 'Paid' ? '#dcfce7' : '#fefce8',
                               color: job.payment_status === 'Paid' ? '#166534' : '#854d0e',
                               border: `1px solid ${job.payment_status === 'Paid' ? '#bbf7d0' : '#fde68a'}`
                            }}>
                              {job.payment_status || 'Pending'}
                            </span>
                            {job.payment_status === 'Paid' && job.payment_collected_at && (
                               <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
                                 Collected: {new Date(job.payment_collected_at).toLocaleDateString()}
                               </div>
                            )}
                          </div>
                        )}
                     </div>
                  ) : (
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Payment Status</span>
                        <div>
                          <span style={{ 
                             fontSize: '12px', fontWeight: 700, padding: '4px 8px', borderRadius: '6px',
                             background: job.payment_status === 'Paid' ? '#dcfce7' : '#fefce8',
                             color: job.payment_status === 'Paid' ? '#166534' : '#854d0e',
                             border: `1px solid ${job.payment_status === 'Paid' ? '#bbf7d0' : '#fde68a'}`
                          }}>
                            {job.payment_status || 'Pending'}
                          </span>
                        </div>
                     </div>
                  )}

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
                    <div className="card-custom" style={{ padding: '24px', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>Materials Used</h3>
                  {!canLogMaterials && (
                    <span style={{ fontSize: '11px', color: '#94a3b8', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>
                      Available at Job Scheduled stage
                    </span>
                  )}
                </div>

                {!canLogMaterials ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                    📋 Materials are logged once the job is scheduled or in progress.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Existing materials */}
                    {materials.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                        No materials logged yet.
                      </div>
                    ) : (
                      materials.map(m => (
                        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{m.inventory_items?.name}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Qty: {m.quantity_used} {m.inventory_items?.unit}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>
                              ${(m.price_at_time * m.quantity_used).toFixed(2)}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveMaterial(m.id, m.item_id, m.quantity_used)}
                              title="Remove material (stock will be returned)"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px', borderRadius: '6px', lineHeight: 0 }}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                            </button>
                          </div>
                        </div>
                      ))
                    )}

                    {/* Add material form */}
                    <div style={{ display: 'flex', gap: '8px', paddingTop: '4px', borderTop: '1px dashed #e2e8f0', marginTop: '4px' }}>
                      <select
                        className="form-input"
                        style={{ flex: 1, fontSize: '13px' }}
                        value={selectedItem}
                        onChange={e => setSelectedItem(e.target.value)}
                      >
                        <option value="">+ Add inventory item...</option>
                        {inventory.map(inv => (
                          <option key={inv.id} value={inv.id} disabled={inv.stock_quantity <= 0}>
                            {inv.name} ({inv.stock_quantity} {inv.unit} available)
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        className="form-input"
                        style={{ width: '64px', fontSize: '13px' }}
                        placeholder="Qty"
                        min={1}
                        value={useQty}
                        onChange={e => setUseQty(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={handleAddMaterial}
                        disabled={!selectedItem || !useQty || matLoading}
                        style={{
                          padding: '0 14px', background: selectedItem && useQty ? '#0f172a' : '#e2e8f0',
                          color: selectedItem && useQty ? '#fff' : '#94a3b8',
                          border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px',
                          cursor: selectedItem && useQty ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap'
                        }}
                      >
                        {matLoading ? '...' : 'Log'}
                      </button>
                    </div>
                  </div>
                )}
             </div>       </div>
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

      {/* Loss Reason Modal */}
      {showLossModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
          backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 300, padding: '20px'
        }}>
          <div style={{
            background: '#fff', borderRadius: '20px', padding: '32px',
            width: '100%', maxWidth: '460px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.2)'
          }}>
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Mark Lead as Lost</h3>
              <p style={{ fontSize: '13px', color: '#64748b', marginTop: '6px', margin: '6px 0 0 0' }}>Select the reason this lead was lost. This helps track patterns.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {LOSS_REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setLossReasonPreset(r)}
                  style={{
                    padding: '10px 16px', borderRadius: '8px', textAlign: 'left',
                    fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                    background: lossReasonPreset === r ? '#fef2f2' : '#f8fafc',
                    border: lossReasonPreset === r ? '1.5px solid #fca5a5' : '1px solid #e2e8f0',
                    color: lossReasonPreset === r ? '#dc2626' : '#334155',
                  }}
                >
                  {lossReasonPreset === r ? '● ' : '○ '}{r}
                </button>
              ))}
            </div>

            {lossReasonPreset === 'Other' && (
              <input
                className="form-input"
                placeholder="Briefly describe the reason..."
                value={lossReasonCustom}
                onChange={e => setLossReasonCustom(e.target.value)}
                style={{ marginBottom: '16px' }}
                autoFocus
              />
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => { setShowLossModal(false); setLossReasonPreset(''); setLossReasonCustom(''); }}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', color: '#475569' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!lossReasonPreset || (lossReasonPreset === 'Other' && !lossReasonCustom.trim()) || loading}
                onClick={handleConfirmLost}
                style={{
                  flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                  background: (lossReasonPreset && !(lossReasonPreset === 'Other' && !lossReasonCustom.trim())) ? '#ef4444' : '#fca5a5',
                  color: '#fff', fontSize: '14px', fontWeight: 600,
                  cursor: (lossReasonPreset && !(lossReasonPreset === 'Other' && !lossReasonCustom.trim())) ? 'pointer' : 'not-allowed',
                  transition: 'background 0.2s'
                }}
              >
                {loading ? 'Saving...' : 'Confirm Lost'}
              </button>
            </div>
          </div>
        </div>
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
                {datePromptConfig?.title || 'Action Required'}
             </h3>
             <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px', lineHeight: 1.5 }}>
                A date is required before you can move this job to <strong>{datePromptConfig?.targetStage}</strong>. Please set it below:
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
                     onClick={() => { setShowDatePrompt(false); setDatePromptConfig(null); setDateInput(""); }}
                     style={{ flex: 1, padding: '12px', background: '#f1f5f9', color: '#475569', borderRadius: '12px', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                   >
                     Cancel
                   </button>
                   <button 
                     type="submit"
                     disabled={loading}
                     style={{ flex: 1, padding: '12px', background: '#0f172a', color: '#fff', borderRadius: '12px', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                   >
                     {loading ? 'Moving...' : 'Confirm & Move'}
                   </button>
                </div>
             </form>
          </div>
        </div>
      )}
    </>
  );
}

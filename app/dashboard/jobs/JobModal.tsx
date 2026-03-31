"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Job, STAGES } from "./JobsClient";

type InventoryItem = { id: string; name: string; unit: string; stock_quantity: number; };
type JobMaterial = { id?: string; item_id: string; quantity_used: number; item_name?: string; unit?: string; isNew?: boolean; cost_at_time?: number; price_at_time?: number; };
type Customer = { id: string; name: string; phone: string | null; address: string | null; };

export default function JobModal({
  job,
  onClose,
  onSave,
  userId,
  role,
  staffProfiles,
}: {
  job: Job | null;
  onClose: () => void;
  onSave: (job: Job) => void;
  userId: string;
  role: "admin" | "staff";
  staffProfiles: { id: string; role: string; full_name?: string; email?: string }[];
}) {
  const isNew = !job;

  const [formData, setFormData] = useState<Partial<Job>>(
    job || {
      stage: "New Enquiry",
      customer_id: "",
      service_type: "Servicing",
      ac_brand: "",
      unit_count: 1,
      visit_date: "",
      job_date: "",
      payment_status: "Pending",
      notes: "",
      assigned_to: "",
      labor_cost: 0,
      quoted_amount: 0,
      priority: "Medium",
      source: "Other",
      status: "open",
      loss_reason: "",
    },
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", address: "" });

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [materials, setMaterials] = useState<JobMaterial[]>([]);
  const [selectedItem, setSelectedItem] = useState("");
  const [useQty, setUseQty] = useState("");

  const supabase = createClient();

  useEffect(() => {
    async function fetchData() {
      // fetch inventory
      const { data: invData } = await supabase.from('inventory_items').select('id, name, unit, stock_quantity, unit_cost, unit_price').order('name');
      if (invData) setInventory(invData);

      // fetch customers
      const { data: cData } = await supabase.from('customers').select('*').order('name');
      if (cData) setCustomers(cData);

      // fetch existing materials if edit mode
      if (!isNew && job) {
        const { data: matData } = await supabase
          .from('job_materials')
          .select(`
            id, item_id, quantity_used, cost_at_time, price_at_time,
            inventory_items(name, unit)
          `)
          .eq('job_id', job.id);

        if (matData) {
          setMaterials(
            matData.map((m: any) => ({
              id: m.id,
              item_id: m.item_id,
              quantity_used: m.quantity_used,
              item_name: m.inventory_items?.name,
              unit: m.inventory_items?.unit,
              isNew: false,
              cost_at_time: m.cost_at_time,
              price_at_time: m.price_at_time
            }))
          );
        }
      }
    }
    fetchData();
  }, [job, isNew, supabase]);

  const handleAddMaterial = () => {
    if (!selectedItem || !useQty) return;
    const qty = parseInt(useQty);
    if (isNaN(qty) || qty <= 0) return;

    const item = inventory.find(i => i.id === selectedItem);
    if (!item) return;

    if (item.stock_quantity < qty) {
      alert(`Not enough stock. Only ${item.stock_quantity} available.`);
      return;
    }

    setMaterials([...materials, {
      item_id: item.id,
      quantity_used: qty,
      item_name: item.name,
      unit: item.unit,
      isNew: true,
      cost_at_time: (item as any).unit_cost,
      price_at_time: (item as any).unit_price
    }]);

    // Optimistically reduce stock in local state so they can't over-select before saving
    setInventory(inventory.map(i => i.id === selectedItem ? { ...i, stock_quantity: i.stock_quantity - qty } : i));

    setSelectedItem("");
    setUseQty("");
  };

  const handleRemoveMaterial = async (m: JobMaterial, idx: number) => {
    if (m.isNew) {
      setMaterials(materials.filter((_, i) => i !== idx));
      setInventory(inventory.map(inv => inv.id === m.item_id ? { ...inv, stock_quantity: inv.stock_quantity + m.quantity_used } : inv));
    } else if (m.id) {
      if (!confirm("Are you sure you want to remove this material? Stock will be returned to inventory.")) return;

      const { error } = await supabase.from('job_materials').delete().eq('id', m.id);
      if (error) {
        alert(error.message);
      } else {
        setMaterials(materials.filter((_, i) => i !== idx));
        // Refresh inventory to see returned stock
        const { data: invData } = await supabase.from('inventory_items').select('*').order('name');
        if (invData) setInventory(invData);
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate customer
    if (!isNewCustomer && !formData.customer_id) {
      setError("Please select a customer or create a new one.");
      setLoading(false);
      return;
    }

    let finalCustomerId = formData.customer_id;

    if (isNewCustomer) {
      if (!newCustomer.name.trim()) {
        setError("New customer name is required.");
        setLoading(false);
        return;
      }
      const { data: newCustData, error: custErr } = await supabase
        .from("customers")
        .insert([{ name: newCustomer.name, phone: newCustomer.phone || null, address: newCustomer.address || null }])
        .select()
        .single();

      if (custErr) {
        setError(custErr.message);
        setLoading(false);
        return;
      }
      finalCustomerId = newCustData.id;
    }

    // Normalize empty dates to null to avoid DB errors
    const dataToSave = { ...formData, customer_id: finalCustomerId };
    delete (dataToSave as any).customers; // Remove nested joined property if it exists
    delete (dataToSave as any).customer_name;
    delete (dataToSave as any).phone;
    delete (dataToSave as any).address;

    if (!dataToSave.visit_date) dataToSave.visit_date = null;
    if (!dataToSave.job_date) dataToSave.job_date = null;
    if (!dataToSave.assigned_to) dataToSave.assigned_to = null;
    if (!dataToSave.unit_count) dataToSave.unit_count = 0;

    // Calculate material cost (price for job total)
    const matCost = materials.reduce((sum, m) => {
      const price = m.price_at_time || 0;
      return sum + (price * m.quantity_used);
    }, 0);
    (dataToSave as any).material_cost = matCost;
    if (!dataToSave.labor_cost) dataToSave.labor_cost = 0;
    if (!dataToSave.quoted_amount) dataToSave.quoted_amount = 0;

    let savedJob = null;

    if (isNew) {
      dataToSave.created_by = userId;
      const { data, error: insertError } = await supabase
        .from("jobs")
        .insert([dataToSave])
        .select()
        .single();

      if (insertError) setError(insertError.message);
      else savedJob = data;
    } else {
      const { data, error: updateError } = await supabase
        .from("jobs")
        .update(dataToSave)
        .eq("id", job.id)
        .select()
        .single();

      if (updateError) setError(updateError.message);
      else savedJob = data;
    }

    if (savedJob) {
      // Save newly added materials
      const newMats = materials.filter(m => m.isNew);
      if (newMats.length > 0) {
        const payload = newMats.map(m => ({
          job_id: savedJob.id,
          item_id: m.item_id,
          quantity_used: m.quantity_used,
          created_by: userId,
          cost_at_time: (m as any).cost_at_time,
          price_at_time: (m as any).price_at_time
        }));
        const { error: matErr } = await supabase.from('job_materials').insert(payload);
        if (matErr) {
          console.error("Error saving materials:", matErr.message);
          setError("Job saved, but some materials could not be logged: " + matErr.message);
          setLoading(false);
          return;
        }
      }
      onSave(savedJob);
    }

    setLoading(false);
  };

  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.phone && c.phone.includes(customerSearch))
  );

  const handleSelectCustomer = (c: Customer) => {
    setFormData({ ...formData, customer_id: c.id });
    setCustomerSearch(c.name);
    setShowCustomerDropdown(false);
    setIsNewCustomer(false);
  };

  return (
    <div 
      style={{ 
        position: 'fixed', inset: 0, zIndex: 100, 
        background: 'rgba(15, 23, 42, 0.4)', 
        backdropFilter: 'blur(8px)', 
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' 
      }} 
      onClick={onClose}
    >
      <div 
        style={{ 
          background: '#fff', width: '100%', maxWidth: '640px', maxHeight: '90vh', 
          borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)', 
          display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #f1f5f9' 
        }} 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '24px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' }}>
           <div>
             <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>{isNew ? "Create New Job" : "Edit Job Detail"}</h2>
             <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>{isNew ? "Enter job details and assign to technician" : `Job ID: ${job.id}`}</p>
           </div>
           <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
             &times;
           </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          {error && (
            <div style={{ marginBottom: '24px', padding: '12px 16px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '12px', color: '#dc2626', fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚠️</span> {error}
            </div>
          )}

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            
            {/* Section: Customer Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer Information</label>
                {!isNewCustomer && (
                  <button type="button" onClick={() => { setIsNewCustomer(true); setFormData({ ...formData, customer_id: "" }); }} style={{ fontSize: '12px', fontWeight: 600, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
                    + New Customer
                  </button>
                )}
              </div>

              {isNewCustomer ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>Adding New Customer</span>
                    <button type="button" onClick={() => setIsNewCustomer(false)} style={{ fontSize: '12px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Cancel</button>
                  </div>
                  <input className="form-input" required placeholder="Full Name" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <input className="form-input" placeholder="Phone Number" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
                    <input className="form-input" placeholder="Address" value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} />
                  </div>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input 
                    className="form-input" 
                    placeholder="Search for existing customer by name or phone..." 
                    value={customerSearch}
                    onFocus={() => setShowCustomerDropdown(true)}
                    onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                    style={{ paddingRight: '40px' }}
                  />
                  <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                    🔍
                  </div>
                  
                  {showCustomerDropdown && (customerSearch || showCustomerDropdown) && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map(c => (
                          <div 
                            key={c.id} 
                            onClick={() => handleSelectCustomer(c)}
                            style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                          >
                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{c.name}</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>{c.phone || 'No phone'} • {c.address || 'No address'}</div>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: '#94a3b8' }}>
                          No customers found. 
                          <button type="button" onClick={() => setIsNewCustomer(true)} style={{ marginLeft: '8px', color: '#2563eb', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>Create new?</button>
                        </div>
                      )}
                    </div>
                  )}
                  {showCustomerDropdown && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setShowCustomerDropdown(false)} />
                  )}
                </div>
              )}
            </div>

            {/* Section: Job Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Job Specifications</label>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div className="form-group">
                  <label className="form-label">Service Type</label>
                  <select className="form-input" value={formData.service_type || "Servicing"} onChange={(e) => setFormData({ ...formData, service_type: e.target.value })}>
                    <option value="Servicing">Servicing</option>
                    <option value="Repair">Repair</option>
                    <option value="Installation">Installation</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">AC Brand</label>
                  <input className="form-input" placeholder="e.g. Daikin, Mitsubishi" value={formData.ac_brand || ""} onChange={(e) => setFormData({ ...formData, ac_brand: e.target.value })} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div className="form-group">
                  <label className="form-label">Unit Count</label>
                  <input type="number" className="form-input" value={formData.unit_count || ""} onChange={(e) => setFormData({ ...formData, unit_count: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select className="form-input" value={formData.priority || "Medium"} onChange={(e) => setFormData({ ...formData, priority: e.target.value })}>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="form-group">
                <label className="form-label">Source</label>
                <select className="form-input" value={formData.source || "Other"} onChange={(e) => setFormData({ ...formData, source: e.target.value })}>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Call">Call</option>
                  <option value="Referral">Referral</option>
                  <option value="Website">Website</option>
                  <option value="Facebook">Facebook</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Lead Status Outcome</label>
                <select className="form-input" value={formData.status || "open"} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                  <option value="open">Active / Open</option>
                  <option value="won">Won (Completed)</option>
                  <option value="lost">Lost (Analysis)</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Pipeline Stage</label>
              <select className="form-input" value={formData.stage || "New Enquiry"} onChange={(e) => setFormData({ ...formData, stage: e.target.value })}>
                {STAGES.map((s) => ( <option key={s} value={s}>{s}</option> ))}
              </select>
            </div>

            {formData.status === 'lost' && (
              <div className="form-group" style={{ padding: '16px', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fee2e2' }}>
                <label className="form-label" style={{ color: '#dc2626' }}>Reason for Loss</label>
                <input 
                  className="form-input" 
                  placeholder="Why was this lead lost?" 
                  value={formData.loss_reason || ""} 
                  onChange={(e) => setFormData({ ...formData, loss_reason: e.target.value })} 
                />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="form-group">
                <label className="form-label">Visit Date</label>
                <input type="date" className="form-input" value={formData.visit_date || ""} onChange={(e) => setFormData({ ...formData, visit_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Job Date</label>
                <input type="date" className="form-input" value={formData.job_date || ""} onChange={(e) => setFormData({ ...formData, job_date: e.target.value })} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Internal Notes</label>
              <textarea className="form-input" rows={3} placeholder="Add any specific details or instructions..." value={formData.notes || ""} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </div>

            {/* Section: Financials & Assignment */}
            <div style={{ padding: '24px', background: '#f8fafc', borderRadius: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
               <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assignment & Financials</label>
               
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div className="form-group">
                    <label className="form-label">Technician Assignment</label>
                    <select className="form-input" value={formData.assigned_to || ""} onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value || null })}>
                      <option value="">-- Unassigned --</option>
                      {staffProfiles.map((staff: any) => (
                        <option key={staff.id} value={staff.id}>{staff.full_name || staff.email}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Total Quotation ($)</label>
                    <input type="number" step="0.01" className="form-input" style={{ fontWeight: 700, color: '#2563eb' }} value={formData.quoted_amount || ""} onChange={(e) => setFormData({ ...formData, quoted_amount: parseFloat(e.target.value) || 0 })} />
                  </div>
               </div>

               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div className="form-group">
                    <label className="form-label">Labor Cost ($)</label>
                    <input type="number" step="0.01" className="form-input" value={formData.labor_cost || ""} onChange={(e) => setFormData({ ...formData, labor_cost: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Payment Status</label>
                    <select className="form-input" value={formData.payment_status || "Pending"} onChange={(e) => setFormData({ ...formData, payment_status: e.target.value })}>
                      <option value="Pending">Pending</option>
                      <option value="Paid">Paid</option>
                    </select>
                  </div>
               </div>
            </div>

            {/* Section: Materials Logging */}
            <div style={{ padding: '24px', background: '#f8fafc', borderRadius: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
               <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
                 Material Consumption Log
               </label>
               
               {materials.length > 0 && (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                   {materials.map((m, idx) => (
                     <div key={m.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{m.item_name}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{m.quantity_used} {m.unit}</div>
                        </div>
                        <button type="button" onClick={() => handleRemoveMaterial(m, idx)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button>
                     </div>
                   ))}
                 </div>
               )}

               <div style={{ display: 'flex', gap: '12px' }}>
                  <select className="form-input" style={{ flex: 1 }} value={selectedItem} onChange={e => setSelectedItem(e.target.value)}>
                    <option value="">Select Inventory Item</option>
                    {inventory.map(inv => (
                      <option key={inv.id} value={inv.id} disabled={inv.stock_quantity <= 0}>
                        {inv.name} ({inv.stock_quantity} available)
                      </option>
                    ))}
                  </select>
                  <input type="number" className="form-input" style={{ width: '80px' }} placeholder="Qty" value={useQty} onChange={e => setUseQty(e.target.value)} />
                  <button type="button" onClick={handleAddMaterial} style={{ padding: '0 20px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '12px', fontWeight: 600, cursor: 'pointer' }}>Log</button>
               </div>
            </div>

            <div className="modal-actions" style={{ position: 'sticky', bottom: 0, background: '#fff', padding: '24px 0 0 0', borderTop: '1px solid #f1f5f9', marginTop: '12px', display: 'flex', gap: '12px' }}>
              <button type="button" className="btn-secondary" style={{ flex: 1, padding: '14px' }} onClick={onClose} disabled={loading}>Cancel</button>
              <button type="submit" className="btn-primary" style={{ flex: 2, padding: '14px', background: '#2563eb', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)' }} disabled={loading}>
                {loading ? "Processing..." : isNew ? "Create Job Order" : "Update Job Record"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

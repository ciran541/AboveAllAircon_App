"use client";

import { useState, useEffect } from "react";
import { Job, STAGES } from "./JobsClient";
import { saveJob } from "@/app/actions/jobActions";
import { createClient } from "@/lib/supabase/client";
import { JOB_STAGES, UNIT_TYPES } from "@/lib/constants";

type Customer = { id: string; name: string; phone: string | null; address: string | null; unit_type?: string | null; };

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
      stage: "Site Visit Scheduled",
      customer_id: "",
      service_type: "Installation",
      ac_brand: "",
      unit_count: 1,
      visit_date: "",
      job_date: "",
      payment_status: "Pending",
      notes: "",
      assigned_to: "",
      quoted_amount: 0,
      priority: "Medium",
      source: "Other",
      status: "open",
      visit_time: "",
    }
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  // For new jobs — default to new customer form
  const [isNewCustomer, setIsNewCustomer] = useState(isNew ? true : false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", address: "", unit_type: "" });

  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    supabase.from("customers").select("*").order("name").then(({ data }) => {
      if (data) setCustomers(data);
    });
    // Pre-fill customer search if editing
    if (!isNew && job?.customers?.name) {
      setCustomerSearch(job.customers.name);
    }
  }, []);

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.phone && c.phone.includes(customerSearch)),
  );

  const handleSelectCustomer = (c: Customer) => {
    setFormData({ ...formData, customer_id: c.id });
    setCustomerSearch(c.name);
    setShowCustomerDropdown(false);
    setIsNewCustomer(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!isNewCustomer && !formData.customer_id) {
      setError("Please select a customer or fill in the new customer form.");
      setLoading(false);
      return;
    }

    let finalCustomerId = formData.customer_id;

    let newCustomerData;
    if (isNewCustomer) {
      if (!newCustomer.name.trim()) {
        setError("Customer name is required.");
        setLoading(false);
        return;
      }
      newCustomerData = {
        name: newCustomer.name,
        phone: newCustomer.phone || null,
        address: newCustomer.address || null,
        unit_type: newCustomer.unit_type || null,
      };
    }

    const dataToSave: any = { ...formData, customer_id: finalCustomerId };
    delete dataToSave.customers;
    delete dataToSave.customer_name;
    delete dataToSave.phone;
    delete dataToSave.address;

    if (!dataToSave.visit_date) dataToSave.visit_date = null;
    if (!dataToSave.job_date) dataToSave.job_date = null;
    if (!dataToSave.visit_time) dataToSave.visit_time = null;
    if (!dataToSave.assigned_to) dataToSave.assigned_to = null;
    if (!dataToSave.unit_count) dataToSave.unit_count = 1;
    if (!dataToSave.quoted_amount) dataToSave.quoted_amount = 0;

    if (isNew) {
      dataToSave.created_by = userId;
    }

    const response = await saveJob(dataToSave, newCustomerData);

    if (response.error) {
      setError(response.error);
    } else if (response.savedJob) {
      if (response.calendarError) {
        alert(`Job saved, but Google Calendar sync failed: ${response.calendarError}`);
      }
      onSave(response.savedJob);
    }

    setLoading(false);
  };


  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
    >
      <div
        style={{ background: "#fff", width: "100%", maxWidth: "600px", maxHeight: "90vh", borderRadius: "24px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #f1f5f9" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "24px 32px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fafafa" }}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", margin: 0 }}>{isNew ? "Create New Job" : "Edit Job"}</h2>
            <p style={{ fontSize: "13px", color: "#64748b", margin: "4px 0 0 0" }}>{isNew ? "Fill in customer and job details" : `Job ID: ${job!.id}`}</p>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "32px" }}>
          {error && (
            <div style={{ marginBottom: 20, padding: "12px 16px", background: "#fef2f2", border: "1px solid #fee2e2", borderRadius: 12, color: "#dc2626", fontSize: 13, fontWeight: 500 }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

            {/* ── Customer Section ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Customer Information
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setIsNewCustomer(true)}
                    style={{
                      fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 8, border: "none", cursor: "pointer", transition: "all 0.2s",
                      background: isNewCustomer ? "#0f172a" : "#f1f5f9",
                      color: isNewCustomer ? "#fff" : "#64748b",
                    }}
                  >New Customer</button>
                  <button
                    type="button"
                    onClick={() => setIsNewCustomer(false)}
                    style={{
                      fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 8, border: "none", cursor: "pointer", transition: "all 0.2s",
                      background: !isNewCustomer ? "#0f172a" : "#f1f5f9",
                      color: !isNewCustomer ? "#fff" : "#64748b",
                    }}
                  >Existing Customer</button>
                </div>
              </div>

              {isNewCustomer ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "20px", background: "#f8fafc", borderRadius: 16, border: "1px dashed #cbd5e1" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>✨ New Customer Details</div>
                  <input className="form-input" required placeholder="Full Name *" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <input className="form-input" placeholder="Phone Number" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
                    <select className="form-input" value={newCustomer.unit_type} onChange={(e) => setNewCustomer({ ...newCustomer, unit_type: e.target.value })}>
                      <option value="">Unit Type (optional)</option>
                      {UNIT_TYPES.map((ut) => <option key={ut} value={ut}>{ut}</option>)}
                    </select>
                  </div>
                  <input className="form-input" placeholder="Address" value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} />
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <input
                    className="form-input"
                    placeholder="Search existing customer by name or phone..."
                    value={customerSearch}
                    onFocus={() => setShowCustomerDropdown(true)}
                    onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); formData.customer_id && setFormData({ ...formData, customer_id: "" }); }}
                    style={{ paddingRight: 40 }}
                  />
                  <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>🔍</div>
                  {showCustomerDropdown && (
                    <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", zIndex: 10, maxHeight: 200, overflowY: "auto" }}>
                      {filteredCustomers.length > 0 ? filteredCustomers.map((c) => (
                        <div key={c.id} onClick={() => handleSelectCustomer(c)}
                          style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", transition: "background 0.15s" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{c.name}</div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>{c.phone || "No phone"} • {c.address || "No address"}</div>
                        </div>
                      )) : (
                        <div style={{ padding: 16, textAlign: "center", fontSize: 13, color: "#94a3b8" }}>
                          No match. <button type="button" onClick={() => setIsNewCustomer(true)} style={{ color: "#2563eb", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>Create new?</button>
                        </div>
                      )}
                    </div>
                  )}
                  {showCustomerDropdown && <div style={{ position: "fixed", inset: 0, zIndex: 9 }} onClick={() => setShowCustomerDropdown(false)} />}
                </div>
              )}
            </div>

            {/* ── Job Details ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Job Details</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Service Type</label>
                  <select className="form-input" value={formData.service_type || "Installation"} onChange={(e) => setFormData({ ...formData, service_type: e.target.value })}>
                    <option value="Installation">Installation</option>
                    <option value="Servicing">Servicing</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">AC Brand</label>
                  <input className="form-input" placeholder="e.g. Daikin, Mitsubishi" value={formData.ac_brand || ""} onChange={(e) => setFormData({ ...formData, ac_brand: e.target.value })} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Number of Units</label>
                  <input type="number" className="form-input" min={1} value={formData.unit_count || 1} onChange={(e) => setFormData({ ...formData, unit_count: parseInt(e.target.value) || 1 })} />
                </div>
                {/* Priority, Assignment, and Financials are currently hidden per request */}
                {/* 
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select className="form-input" value={formData.priority || "Medium"} onChange={(e) => setFormData({ ...formData, priority: e.target.value })}>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
                */}
              </div>
            </div>

            {/* ── Visit Schedule ── */}
            <div style={{ padding: "24px", background: "#f8fafc", borderRadius: 20, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Visit Schedule</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Visit Date *</label>
                  <input type="date" required className="form-input" value={formData.visit_date || ""} onChange={(e) => setFormData({ ...formData, visit_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Visit Time *</label>
                  <input type="time" required className="form-input" value={formData.visit_time || ""} onChange={(e) => setFormData({ ...formData, visit_time: e.target.value })} />
                </div>
              </div>
            </div>

            {/* ── Assignment & Financials (Hidden) ── */}
            {/*
            <div style={{ padding: "24px", background: "#f8fafc", borderRadius: 20, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Assignment & Financials</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Assign Technician</label>
                  <select className="form-input" value={formData.assigned_to || ""} onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value || null })}>
                    <option value="">-- Unassigned --</option>
                    {staffProfiles.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.full_name || s.email}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Quoted Amount ($)</label>
                  <input type="number" step="0.01" className="form-input" style={{ fontWeight: 700, color: "#2563eb" }} value={formData.quoted_amount || ""} onChange={(e) => setFormData({ ...formData, quoted_amount: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
            </div>
            */}

            {/* ── Notes ── */}
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-input" rows={3} placeholder="Any initial details or instructions..." value={formData.notes || ""} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </div>

            {/* ── Actions ── */}
            <div style={{ display: "flex", gap: 12, paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
              <button type="button" className="btn-secondary" style={{ flex: 1, padding: 14 }} onClick={onClose} disabled={loading}>Cancel</button>
              <button type="submit" className="btn-primary" style={{ flex: 2, padding: 14, background: "#0f172a", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.15)" }} disabled={loading}>
                {loading ? "Saving..." : isNew ? "Create Job" : "Update Job"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

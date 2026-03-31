"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CustomersClient({ initialCustomers }: { initialCustomers: any[] }) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({ id: "", name: "", phone: "", address: "", email: "" });

  const supabase = createClient();
  const router = useRouter();

  const handleOpenModal = (customer?: any) => {
    if (customer) {
      router.push(`/dashboard/customers/${customer.id}`);
      return;
    }
    setFormData({ id: "", name: "", phone: "", address: "", email: "" });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (formData.id) {
      // Update
      const { data, error } = await supabase
        .from("customers")
        .update({
          name: formData.name,
          phone: formData.phone || null,
          address: formData.address || null,
          email: formData.email || null,
        })
        .eq("id", formData.id)
        .select()
        .single();

      if (!error && data) {
        setCustomers(customers.map((c) => (c.id === data.id ? { ...data, jobs: c.jobs } : c)));
        setIsModalOpen(false);
      } else {
        alert(error?.message);
      }
    } else {
      // Insert
      const { data, error } = await supabase
        .from("customers")
        .insert([{
          name: formData.name,
          phone: formData.phone || null,
          address: formData.address || null,
          email: formData.email || null,
        }])
        .select()
        .single();

      if (!error && data) {
        setCustomers([{ ...data, jobs: [] }, ...customers]);
        setIsModalOpen(false);
      } else {
        alert(error?.message);
      }
    }
    setLoading(false);
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.phone && c.phone.includes(searchQuery))
  );

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto", color: "#0f172a" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", letterSpacing: "-0.02em", margin: "0 0 8px 0" }}>
            Customer Directory
          </h1>
          <p style={{ color: "#64748b", margin: 0, fontSize: "15px" }}>
            Manage client profiles and service history ({customers.length} total)
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary"
          style={{ width: "auto", padding: "10px 24px", background: "#0ea5e9" }}
        >
          + Add Customer
        </button>
      </div>

      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
          <div style={{ position: "relative", maxWidth: "400px" }}>
            <span style={{ position: "absolute", left: 14, top: 12, color: "#94a3b8" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", padding: "10px 14px 10px 40px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "14px" }}
              onFocus={e => e.target.style.borderColor = "#3b82f6"}
              onBlur={e => e.target.style.borderColor = "#cbd5e1"}
            />
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#f1f5f9", color: "#475569", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ padding: "16px 20px", fontWeight: "600" }}>Name</th>
                <th style={{ padding: "16px 20px", fontWeight: "600" }}>Contact Info</th>
                <th style={{ padding: "16px 20px", fontWeight: "600" }}>Address</th>
                <th style={{ padding: "16px 20px", fontWeight: "600", textAlign: "center" }}>Lifetime Jobs</th>
                <th style={{ padding: "16px 20px", fontWeight: "600", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                    No customers found matching "{searchQuery}"
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c) => (
                  <tr key={c.id} 
                    onClick={() => router.push(`/dashboard/customers/${c.id}`)}
                    style={{ borderTop: "1px solid #f1f5f9", cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} 
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "16px 20px" }}>
                      <div style={{ fontWeight: "600", color: "#0f172a" }}>{c.name}</div>
                      <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: 4 }}>Added {new Date(c.created_at).toLocaleDateString()}</div>
                    </td>
                    <td style={{ padding: "16px 20px", color: "#475569" }}>
                      {c.phone ? <div>{c.phone}</div> : <span style={{ color: "#cbd5e1" }}>No Phone</span>}
                      {c.email && <div style={{ fontSize: 13, marginTop: 4, color: "#64748b" }}>{c.email}</div>}
                    </td>
                    <td style={{ padding: "16px 20px", color: "#475569", maxWidth: "250px" }}>
                      {c.address ? (
                         <span style={{ display: "block", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }} title={c.address}>{c.address}</span>
                      ) : <span style={{ color: "#cbd5e1" }}>No Address</span>}
                    </td>
                    <td style={{ padding: "16px 20px", textAlign: "center" }}>
                      <span style={{ background: c.jobs?.length > 0 ? "#e0f2fe" : "#f1f5f9", color: c.jobs?.length > 0 ? "#0369a1" : "#64748b", padding: "4px 10px", borderRadius: "20px", fontSize: "13px", fontWeight: "600" }}>
                        {c.jobs?.length || 0}
                      </span>
                    </td>
                    <td style={{ padding: "16px 20px", textAlign: "right" }}>
                      <button
                        onClick={() => handleOpenModal(c)}
                        style={{ background: "none", border: "none", color: "#3b82f6", fontWeight: "600", cursor: "pointer", padding: "6px 12px", borderRadius: "6px" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2 className="modal-title">{formData.id ? "Edit Customer" : "Add New Customer"}</h2>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">Full Name <span style={{color: '#ef4444'}}>*</span></label>
                <input
                  required
                  className="form-input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. John Doe, ABC Corp"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input
                    className="form-input"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Property Address</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Installation / Servicing address"
                />
              </div>

              <div className="modal-actions" style={{ marginTop: 32 }}>
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ width: "auto" }} disabled={loading}>
                  {loading ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

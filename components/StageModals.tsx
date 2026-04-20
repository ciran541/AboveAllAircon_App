"use client";

import { useState } from "react";

// ── SITE VISIT MODAL ────────────────────────────────────────────────────────
export function SiteVisitModal({
  job,
  onClose,
  onSubmit,
  loading,
}: {
  job: any;
  onClose: () => void;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const [svDate, setSvDate] = useState(job?.visit_date || "");
  const [svTime, setSvTime] = useState(job?.visit_time || "");
  const [svPhone, setSvPhone] = useState(job?.visit_phone || job?.customers?.phone || "");
  const [svAddress, setSvAddress] = useState(job?.customers?.address || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!svDate) return;
    onSubmit({
      visit_date: svDate,
      visit_time: svTime || null,
      visit_phone: svPhone || null,
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "24px 28px", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🗓</div>
        <h3 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: "0 0 6px 0" }}>Schedule Site Visit</h3>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px 0" }}>Fill in the visit details. Address and phone are pre-filled from the customer record.</p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-group">
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Visit Date *</label>
              <input type="date" required className="form-input" style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }} value={svDate} onChange={(e) => setSvDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Time</label>
              <input type="time" className="form-input" style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }} value={svTime} onChange={(e) => setSvTime(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Contact Phone</label>
            <input className="form-input" placeholder="Customer phone..." style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }} value={svPhone} onChange={(e) => setSvPhone(e.target.value)} />
          </div>
          <div className="form-group">
            <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Address</label>
            <input className="form-input" placeholder="Visit address..." style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }} value={svAddress} onChange={(e) => setSvAddress(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: 13, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#475569" }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: 13, borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              {loading ? "Scheduling..." : "Schedule & Move"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── QUOTATION MODAL ──────────────────────────────────────────────────────────
export function QuotationModal({
  job,
  onClose,
  onSubmit,
  loading,
}: {
  job: any;
  onClose: () => void;
  onSubmit: (data: any, whatsappText: string) => void;
  loading: boolean;
}) {
  const [qBrand, setQBrand] = useState(job?.ac_brand || "");
  const [qUnits, setQUnits] = useState(job?.unit_count || 1);
  const [qService, setQService] = useState(job?.service_type || "");
  const [qAmount, setQAmount] = useState(job?.quoted_amount || 0);
  const [qNotes, setQNotes] = useState("");
  const [qEngineer, setQEngineer] = useState(job?.engineer_name || "Jackie");
  const [qCustomBreakdown, setQCustomBreakdown] = useState(job?.quotation_breakdown || `Mitsubishi Starmex R32 4Ticks

MUYGP24VF2 (Outdoor Unit)
MSYGP24VF (Indoor Unit)
24k BTU - $2030nett
System 1

Mitsubishi Starmex R32 5Ticks

MXY2H20VF (Outdoor Unit)
MSXYFP13VG x 2 (Indoor Unit)
12k, 12k BTU - $2360nett
System 2 

A water pump is required - $200nett

x2 stainless-steel brackets - $300nett ($150/each)

 Total: $4890nett`);
  const [qMaterials, setQMaterials] = useState(job?.quotation_materials || `✔22g copper pipings
✔Keystone cables 3c40/3c70 (local brand)
✔1/2 inch class 0 kflex
✔16mm drainage pipe with insulation
✔DNE TRUNKINGS`);
  const [qWarranty, setQWarranty] = useState(job?.quotation_warranty || `✔ 5 years compressor by Mitsubishi
✔ 1 year fan coil by Mitsubishi
✔ 3 years workmanship for the new pipings work`);

  const buildWhatsAppTemplate = () => {
    const customer = job?.customers?.name || "Customer";
    const address = job?.customers?.address || "";
    const phone = job?.visit_phone || job?.customers?.phone || "";
    
    return `Hello ${customer}, this is Above All Aircon. My engineer ${qEngineer} had a site survey at your mentioned address - ${address} Hp: ${phone}

${qCustomBreakdown}

Installation with Full Upgraded Materials as below:
${qMaterials}

Warranty
${qWarranty}

Aircons’ goods are subject to stocks availability.

Terms: 30days. To confirm the installation date, deposit details will be forwarded after confirmation

Hope to hear from you the soonest!`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const whatsappText = buildWhatsAppTemplate();
    onSubmit({
      ac_brand: qBrand,
      unit_count: qUnits,
      service_type: qService,
      quoted_amount: qAmount,
      quotation_breakdown: qCustomBreakdown,
      quotation_materials: qMaterials,
      quotation_warranty: qWarranty,
      engineer_name: qEngineer,
      notes: qNotes ? [job?.notes, qNotes].filter(Boolean).join("\n---\n") : job?.notes,
    }, whatsappText);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "24px 28px", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
        <h3 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: "0 0 6px 0" }}>Submit Quotation</h3>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px 0" }}>Confirm service details — a WhatsApp template will be generated for you to send to the customer.</p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Quoted Amount ($) *</label>
              <input type="number" step="0.01" required className="form-input" style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontWeight: 700, color: "#2563eb" }} value={qAmount} onChange={(e) => setQAmount(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Engineer Name</label>
              <input className="form-input" placeholder="Jackie" style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }} value={qEngineer} onChange={(e) => setQEngineer(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Quotation Breakdown</label>
            <textarea className="form-input" rows={8} style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }} value={qCustomBreakdown} onChange={(e) => setQCustomBreakdown(e.target.value)} />
          </div>
          <div className="form-group">
            <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Upgraded Materials</label>
            <textarea className="form-input" rows={4} style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }} value={qMaterials} onChange={(e) => setQMaterials(e.target.value)} />
          </div>
          <div className="form-group">
            <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Warranty Details</label>
            <textarea className="form-input" rows={2} style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }} value={qWarranty} onChange={(e) => setQWarranty(e.target.value)} />
          </div>
          <div className="form-group">
            <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Additional Notes (private)</label>
            <textarea className="form-input" rows={2} placeholder="Internal details..." style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }} value={qNotes} onChange={(e) => setQNotes(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: 13, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#475569" }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: 13, borderRadius: 10, border: "none", background: "linear-gradient(135deg,#d97706,#b45309)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              {loading ? "Generating..." : "Generate WhatsApp Template →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── WHATSAPP TEMPLATE MODAL ──────────────────────────────────────────────────
export function WhatsAppTemplateModal({
  whatsappText,
  onClose,
}: {
  whatsappText: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(whatsappText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1400, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "24px 28px", width: "100%", maxWidth: 560, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>💬</div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 }}>WhatsApp Quotation Template</h3>
            <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0 0" }}>Job moved to "Quotation Sent" ✅</p>
          </div>
        </div>
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 20, marginBottom: 20, fontFamily: "monospace", fontSize: 13, color: "#166534", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {whatsappText}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 13, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#475569" }}>Close</button>
          <button onClick={copyToClipboard} style={{
            flex: 2, padding: 13, borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer",
            background: copied ? "#059669" : "linear-gradient(135deg,#25d366,#128c7e)", color: "#fff",
            transition: "background 0.3s"
          }}>
            {copied ? "✓ Copied!" : "📋 Copy to Clipboard"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CONFIRM JOB MODAL ────────────────────────────────────────────────────────
export function ConfirmJobModal({
  job,
  onClose,
  onSubmit,
  loading,
}: {
  job: any;
  onClose: () => void;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const [cjDate, setCjDate] = useState(job?.job_date || "");
  const [cjTime, setCjTime] = useState(job?.job_time || "");
  const [cjCollected, setCjCollected] = useState(job?.deposit_collected || 0);
  const [cvRedeemed, setCvRedeemed] = useState(Boolean(job?.cv_redeemed));
  const [cvAmount, setCvAmount] = useState(Number(job?.cv_amount || 0));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cjDate) return;
    onSubmit({
      job_date: cjDate,
      job_time: cjTime || null,
      deposit_collected: cjCollected,
      cv_redeemed: cvRedeemed,
      cv_amount: cvAmount,
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "24px 28px", width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
        <h3 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: "0 0 6px 0" }}>Confirm Job</h3>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px 0" }}>Enter the confirmed job date and deposit details to proceed.</p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-group">
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Job Date *</label>
              <input type="date" required className="form-input" style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }} value={cjDate} onChange={(e) => setCjDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Job Time</label>
              <input type="time" className="form-input" style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }} value={cjTime} onChange={(e) => setCjTime(e.target.value)} />
            </div>
          </div>

          <div style={{ background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Deposit Details</div>
            <div className="form-group">
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Deposit Collected ($)</label>
              <input type="number" step="0.01" className="form-input" style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }} value={cjCollected} onChange={(e) => setCjCollected(parseFloat(e.target.value) || 0)} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 10 }}>
                <input type="checkbox" id="cjCvRedeemed" checked={cvRedeemed} onChange={(e) => setCvRedeemed(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
                <label htmlFor="cjCvRedeemed" style={{ fontSize: 11, fontWeight: 700, color: "#475569", cursor: 'pointer' }}>Apply SG CV</label>
              </div>

              {cvRedeemed && (
                <div className="form-group">
                  <label style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>CV Amount ($)</label>
                  <input type="number" step="0.01" className="form-input" style={{ width: "100%", padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: 12 }} value={cvAmount} onChange={(e) => setCvAmount(parseFloat(e.target.value) || 0)} />
                </div>
              )}
            </div>

            <div style={{ height: 1, background: "#e2e8f0", margin: "4px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b" }}>
              <span>Quoted Amount:</span><span style={{ fontWeight: 700, color: "#0f172a" }}>${Number(job?.quoted_amount || 0).toFixed(2)}</span>
            </div>
            {cvRedeemed && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#10b981" }}>
                <span>Voucher Deduction:</span><span style={{ fontWeight: 700 }}>-${cvAmount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b" }}>
              <span>Remaining Balance:</span>
              <span style={{ fontWeight: 700, color: "#f59e0b" }}>${Math.max(0, Number(job?.quoted_amount || 0) - cjCollected - (cvRedeemed ? cvAmount : 0)).toFixed(2)}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: 13, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#475569" }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: 13, borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              {loading ? "Confirming..." : "Confirm & Schedule Job →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── SECOND VISIT MODAL ────────────────────────────────────────────────────────
export function SecondVisitModal({
  job,
  onClose,
  onSubmit,
  loading,
}: {
  job: any;
  onClose: () => void;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const [svDate, setSvDate] = useState(job?.second_visit_date || "");
  const [svTime, setSvTime] = useState(job?.second_visit_time || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!svDate) return;
    onSubmit({
      second_visit_date: svDate,
      second_visit_time: svTime || null,
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "24px 28px", width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>📅</div>
        <h3 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: "0 0 6px 0" }}>Schedule Second Visit</h3>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px 0" }}>Enter the confirmed date and time for the second visit callback.</p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-group">
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Visit Date *</label>
              <input type="date" required className="form-input" style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }} value={svDate} onChange={(e) => setSvDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Visit Time</label>
              <input type="time" className="form-input" style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }} value={svTime} onChange={(e) => setSvTime(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: 13, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#475569" }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: 13, borderRadius: 10, border: "none", background: "linear-gradient(135deg,#059669,#047857)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              {loading ? "Confirming..." : "Schedule Second Visit →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── COMPLETE JOB MODAL ────────────────────────────────────────────────────────
export function CompleteJobModal({
  job,
  onClose,
  onSubmit,
  loading,
  targetStage,
}: {
  job: any;
  onClose: () => void;
  onSubmit: (data: any) => void;
  loading: boolean;
  targetStage?: string;
}) {
  const isFinalCompletion = targetStage === "Completed";
  const quotedAmount = Number(job?.quoted_amount || 0);
  const depositCollected = Number(job?.deposit_collected || 0);
  const [cvAmount, setCvAmount] = useState<number>(Number(job?.cv_amount || 0));
  const [cvRedeemed, setCvRedeemed] = useState<boolean>(Boolean(job?.cv_redeemed));

  const outstandingBalance = Math.max(0, quotedAmount - depositCollected - (cvRedeemed ? cvAmount : 0));
  const prevBalanceCollected = Number(job?.final_payment_collected || 0);

  // Default new collection to the remaining balance if final completion, otherwise 0
  const [newCollection, setNewCollection] = useState<number>(
    isFinalCompletion ? Math.max(0, outstandingBalance - prevBalanceCollected) : 0
  );

  const totalBalanceCollected = prevBalanceCollected + newCollection;
  const remaining = Math.max(0, outstandingBalance - totalBalanceCollected);

  const [paymentStatus, setPaymentStatus] = useState<string>(
    remaining <= 0 ? "Paid" : "Pending"
  );

  const handleNewCollectionChange = (val: number) => {
    setNewCollection(val);
    if (prevBalanceCollected + val >= outstandingBalance) {
      setPaymentStatus("Paid");
    } else {
      setPaymentStatus("Pending");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updates: any = {
      final_payment_collected: totalBalanceCollected,
      payment_status: paymentStatus,
      cv_redeemed: cvRedeemed,
      cv_amount: cvAmount,
    };
    if (paymentStatus === "Paid" && job?.payment_status !== "Paid") {
      updates.payment_collected_at = new Date().toISOString();
    }
    onSubmit(updates);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "24px 28px", width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>{isFinalCompletion ? "🏆" : "💰"}</div>
        <h3 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: "0 0 6px 0" }}>
          {isFinalCompletion ? "Finalize Completion" : "Review Financials"}
        </h3>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px 0" }}>
          {isFinalCompletion 
            ? "Confirm that all payments have been received to fully complete this job."
            : "Please review the final payment for this job before marking it as job done."}
        </p>
        
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* ... (financial summary code remains) ... */}
          <div style={{ background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 4 }}>Financial Summary</div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b" }}>
              <span>Total Quoted:</span><span style={{ fontWeight: 700, color: "#0f172a" }}>${quotedAmount.toFixed(2)}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 10 }}>
                <input type="checkbox" id="compCvRedeemed" checked={cvRedeemed} onChange={(e) => setCvRedeemed(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
                <label htmlFor="compCvRedeemed" style={{ fontSize: 11, fontWeight: 700, color: "#475569", cursor: 'pointer' }}>Apply SG CV</label>
              </div>

              {cvRedeemed && (
                <div className="form-group">
                  <label style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>CV Amount ($)</label>
                  <input type="number" step="0.01" className="form-input" style={{ width: "100%", padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: 12 }} value={cvAmount} onChange={(e) => setCvAmount(parseFloat(e.target.value) || 0)} />
                </div>
              )}
            </div>

            {cvRedeemed && cvAmount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#10b981", background: "#f0fdf4", padding: "6px 10px", borderRadius: 8, border: "1px solid #bbf7d0", marginBottom: 4 }}>
                <span>🏷 CV Redeemed Deduction:</span>
                <span style={{ fontWeight: 700 }}>-${cvAmount.toFixed(2)}</span>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b" }}>
              <span>Deposit Collected:</span>
              <span style={{ fontWeight: 700, color: "#64748b" }}>- ${depositCollected.toFixed(2)}</span>
            </div>

            {prevBalanceCollected > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b" }}>
                <span>Previously Paid Balance:</span>
                <span style={{ fontWeight: 700, color: "#64748b" }}>- ${prevBalanceCollected.toFixed(2)}</span>
              </div>
            )}

            <div style={{ height: 1, background: "#e2e8f0" }} />

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>Remaining Outstanding:</span>
              <span style={{ fontWeight: 800, color: "#f59e0b" }}>${Math.max(0, outstandingBalance - prevBalanceCollected).toFixed(2)}</span>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 8 }}>
            <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
              {isFinalCompletion ? "Collect Final Payment ($)" : "Current Payment Collection ($)"}
            </label>
            <input
              type="number"
              step="0.01"
              min={0}
              required
              className="form-input"
              style={{ width: "100%", padding: "12px", border: "2px solid #bfdbfe", borderRadius: "10px", fontSize: 16, fontWeight: 700, color: "#2563eb" }}
              value={newCollection}
              onChange={(e) => handleNewCollectionChange(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 16px", borderRadius: 10,
            background: remaining === 0 ? "#f0fdf4" : "#fefce8",
            border: `1px solid ${remaining === 0 ? "#bbf7d0" : "#fde68a"}`,
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: remaining === 0 ? "#15803d" : "#92400e" }}>
              {remaining === 0 ? "✅ Fully Settled" : "Remaining Balance:"}
            </span>
            <span style={{ fontSize: 16, fontWeight: 800, color: remaining === 0 ? "#15803d" : "#b45309" }}>
              ${remaining.toFixed(2)}
            </span>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: 13, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#475569" }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: 13, borderRadius: 10, border: "none", background: "linear-gradient(135deg,#059669,#047857)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              {loading ? (isFinalCompletion ? "Completing..." : "Saving...") : (isFinalCompletion ? "Job Fully Completed ✓" : "Mark Job Done ✓")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import InvoicePreviewModal from "@/components/InvoicePreviewModal";

const STAGES = [
  "New Enquiry",
  "Site Visit Scheduled",
  "Quotation Sent",
  "Job Scheduled",
  "First Visit",
  "Completed",
];

const STAGE_DISPLAY: Record<string, string> = { "In Progress": "First Visit" };
const getStageDisplay = (s: string) => STAGE_DISPLAY[s] || s;
// Map "First Visit" back to "In Progress" to bypass DB check constraint
const getStageDB = (s: string) => (s === "First Visit" ? "In Progress" : s);

const UNIT_TYPES = ["BTO", "Resale", "Condo", "Landed", "Commercial"];

export default function JobDetailClient({
  initialJob,
  initialMaterials,
  staffProfiles,
  userRole,
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
  const [showCRMPanel, setShowCRMPanel] = useState(false);

  // Stage action modals
  const [showSiteVisitModal, setShowSiteVisitModal] = useState(false);
  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [showConfirmJobModal, setShowConfirmJobModal] = useState(false);
  const [showWhatsAppTemplate, setShowWhatsAppTemplate] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [whatsappText, setWhatsappText] = useState("");
  const [copied, setCopied] = useState(false);

  // Site Visit form
  const [svDate, setSvDate] = useState("");
  const [svTime, setSvTime] = useState("");
  const [svPhone, setSvPhone] = useState(job.customers?.phone || "");
  const [svAddress, setSvAddress] = useState(job.customers?.address || "");

  // Quotation form
  const [qBrand, setQBrand] = useState(job.ac_brand || "");
  const [qUnits, setQUnits] = useState(job.unit_count || 1);
  const [qService, setQService] = useState(job.service_type || "");
  const [qItems, setQItems] = useState("");
  const [qAmount, setQAmount] = useState(job.quoted_amount || 0);
  const [qNotes, setQNotes] = useState("");
  const [qEngineer, setQEngineer] = useState("Jackie");
  const [qCustomBreakdown, setQCustomBreakdown] = useState(`Mitsubishi Starmex R32 4Ticks

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
  const [qMaterials, setQMaterials] = useState(`✔22g copper pipings
✔Keystone cables 3c40/3c70 (local brand)
✔1/2 inch class 0 kflex
✔16mm drainage pipe with insulation
✔DNE TRUNKINGS`);
  const [qWarranty, setQWarranty] = useState(`✔ 5 years compressor by Mitsubishi
✔ 1 year fan coil by Mitsubishi
✔ 3 years workmanship for the new pipings work`);

  // Confirm Job form
  const [cjDate, setCjDate] = useState(job.job_date || "");
  const [cjTime, setCjTime] = useState(job.job_time || "");
  const [cjDeposit, setCjDeposit] = useState(job.deposit_amount || 0);
  const [cjCollected, setCjCollected] = useState(job.deposit_collected || 0);


  // Material management
  const [inventory, setInventory] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState("");
  const [useQty, setUseQty] = useState("");
  const [matLoading, setMatLoading] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  const normalizedStage = getStageDisplay(job.stage);
  const stageIndex = STAGES.indexOf(normalizedStage);

  const MATERIAL_STAGES = ["Job Scheduled", "First Visit", "Completed"];
  const canLogMaterials = MATERIAL_STAGES.includes(normalizedStage);

  useEffect(() => {
    if (canLogMaterials) {
      supabase.from("inventory_items").select("id, name, unit, stock_quantity, unit_cost, unit_price").order("name")
        .then(({ data }) => { if (data) setInventory(data); });
    }
  }, [job.stage]);

  // ── Stage advance ──────────────────────────────────────────
  const advanceStage = async (newStage: string, extraFields?: Record<string, any>) => {
    setLoading(true);
    const dbStage = getStageDB(newStage);
    const { data, error } = await supabase.from("jobs").update({ stage: dbStage, ...extraFields }).eq("id", job.id).select().single();
    if (!error && data) setJob({ ...job, ...data });
    else if (error) alert("Error: " + error.message);
    setLoading(false);
  };

  // ── Site Visit submit ──────────────────────────────────────
  const handleSiteVisitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!svDate) return;
    await advanceStage("Site Visit Scheduled", {
      visit_date: svDate,
      visit_time: svTime || null,
      visit_phone: svPhone || null,
    });
    setShowSiteVisitModal(false);
  };

  // ── Quotation submit ───────────────────────────────────────
  const buildWhatsAppTemplate = () => {
    const customer = job.customers?.name || "Customer";
    const address = svAddress || job.customers?.address || "";
    const phone = svPhone || job.customers?.phone || "";
    
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

  const handleQuotationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Save quotation details to job
    setLoading(true);
    const { data, error } = await supabase.from("jobs").update({
      stage: "Quotation Sent",
      ac_brand: qBrand,
      unit_count: qUnits,
      service_type: qService,
      quoted_amount: qAmount,
      notes: [job.notes, qNotes].filter(Boolean).join("\n---\n"),
    }).eq("id", job.id).select().single();
    if (!error && data) {
      setJob({ ...job, ...data });
      const template = buildWhatsAppTemplate();
      setWhatsappText(template);
      setShowQuotationModal(false);
      setShowWhatsAppTemplate(true);
    } else if (error) {
      alert("Error: " + error.message);
    }
    setLoading(false);
  };

  // ── Confirm Job submit ─────────────────────────────────────
  const handleConfirmJobSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cjDate) return;
    await advanceStage("Job Scheduled", {
      job_date: cjDate,
      job_time: cjTime || null,
      deposit_amount: cjDeposit,
      deposit_collected: cjCollected,
    });
    setShowConfirmJobModal(false);
  };


  // ── Material management ────────────────────────────────────
  const handleAddMaterial = async () => {
    if (!selectedItem || !useQty) return;
    const qty = parseInt(useQty);
    if (isNaN(qty) || qty <= 0) return;
    const item = inventory.find((i) => i.id === selectedItem);
    if (!item) return;
    if (item.stock_quantity < qty) { alert(`Insufficient stock — only ${item.stock_quantity} ${item.unit} available.`); return; }
    setMatLoading(true);
    const { data, error } = await supabase.from("job_materials").insert([{
      job_id: job.id, item_id: item.id, quantity_used: qty,
      created_by: job.created_by, cost_at_time: item.unit_cost || 0, price_at_time: item.unit_price || 0,
    }]).select("id, item_id, quantity_used, cost_at_time, price_at_time").single();
    if (!error && data) {
      setMaterials((prev: any[]) => [...prev, { ...data, inventory_items: { name: item.name, unit: item.unit } }]);
      setInventory((prev) => prev.map((i) => i.id === selectedItem ? { ...i, stock_quantity: i.stock_quantity - qty } : i));
      setSelectedItem(""); setUseQty("");
    } else if (error) alert("Error adding material: " + error.message);
    setMatLoading(false);
  };

  const handleRemoveMaterial = async (matId: string, itemId: string, qty: number) => {
    if (!confirm("Remove this material? Stock will be returned to inventory.")) return;
    const { error } = await supabase.from("job_materials").delete().eq("id", matId);
    if (!error) {
      setMaterials((prev: any[]) => prev.filter((m) => m.id !== matId));
      setInventory((prev) => prev.map((i) => i.id === itemId ? { ...i, stock_quantity: i.stock_quantity + qty } : i));
    }
  };

  // ── Edit save ──────────────────────────────────────────────
  const handleSaveFields = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const updates: any = {};
    if (fd.has("service_type")) updates.service_type = fd.get("service_type");
    if (fd.has("ac_brand")) updates.ac_brand = fd.get("ac_brand");
    if (fd.has("unit_count")) updates.unit_count = parseInt(fd.get("unit_count") as string) || 0;
    if (fd.has("priority")) updates.priority = fd.get("priority");
    if (fd.has("source")) updates.source = fd.get("source");
    if (fd.has("service_report_no")) updates.service_report_no = fd.get("service_report_no");
    if (fd.has("internal_notes")) updates.internal_notes = fd.get("internal_notes");
    if (fd.has("notes")) updates.notes = fd.get("notes");

    // Conditionally update restricted inputs
    if (fd.has("quoted_amount")) updates.quoted_amount = parseFloat(fd.get("quoted_amount") as string) || 0;
    if (fd.has("deposit_amount")) updates.deposit_amount = parseFloat(fd.get("deposit_amount") as string) || 0;
    if (fd.has("deposit_collected")) updates.deposit_collected = parseFloat(fd.get("deposit_collected") as string) || 0;
    
    if (fd.has("assigned_to")) updates.assigned_to = fd.get("assigned_to") || null;
    if (fd.has("visit_date")) updates.visit_date = fd.get("visit_date") || null;
    if (fd.has("job_date")) updates.job_date = fd.get("job_date") || null;
    // Customer unit_type update
    const unitType = fd.get("unit_type");
    if (unitType !== null && job.customer_id) {
      await supabase.from("customers").update({ unit_type: unitType || null }).eq("id", job.customer_id);
    }

    if (userRole === "admin") {
      const ps = fd.get("payment_status");
      if (ps) {
        updates.payment_status = ps;
        if (ps === "Paid" && job.payment_status !== "Paid") updates.payment_collected_at = new Date().toISOString();
        else if (ps === "Pending" && job.payment_status === "Paid") updates.payment_collected_at = null;
      }
    }

    const { data, error } = await supabase.from("jobs").update(updates).eq("id", job.id).select().single();
    if (!error && data) {
      const newStaff = staffProfiles.find((s: any) => s.id === data.assigned_to);
      setJob({ ...job, ...data, assigned_staff: newStaff || null });
      setIsEditing(false);
    } else alert(error?.message);
    setLoading(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(whatsappText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  };

  const resolvedStaff = job.assigned_staff || staffProfiles.find((s: any) => s.id === job.assigned_to);
  const staffName = resolvedStaff ? (resolvedStaff.full_name || resolvedStaff.name || resolvedStaff.email) : null;
  const remaining = (Number(job.deposit_amount) || 0) - (Number(job.deposit_collected) || 0);

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

        {/* ── HEADER ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6", background: "#eff6ff", padding: "4px 10px", borderRadius: 6, textTransform: "uppercase" }}>
                Job #{job.id.substring(0, 8)}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>• Created {new Date(job.created_at).toLocaleDateString()}</span>
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.8px", margin: 0 }}>
              {job.customers?.name || "Unnamed Job"}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => setShowInvoiceModal(true)}
              style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #10b981, #059669)", fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)" }}
            >
              📄 Preview & Download Invoice
            </button>
            <button onClick={() => setIsEditing(!isEditing)} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 600, color: "#475569", cursor: "pointer" }}>
              {isEditing ? "Cancel Edit" : "Edit Details"}
            </button>
            {!isEditing && (
              <button
                style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#ef4444", fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer" }}
                onClick={async () => {
                  if (confirm("Delete this job permanently?")) {
                    await supabase.from("jobs").delete().eq("id", job.id);
                    router.push("/dashboard/jobs");
                  }
                }}
              >Delete Job</button>
            )}
          </div>
        </div>

        {/* ── STAGE TIMELINE (read-only) ── */}
        <div style={{ background: "#fff", padding: "28px 32px", borderRadius: 16, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 20 }}>Job Progress</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            {STAGES.map((s, idx) => {
              const isCompleted = idx < stageIndex;
              const isCurrent = idx === stageIndex;
              return (
                <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                  {idx < STAGES.length - 1 && (
                    <div style={{ position: "absolute", top: 15, left: "60%", width: "80%", height: 2, background: idx < stageIndex ? "#22c55e" : "#e2e8f0", zIndex: 0 }} />
                  )}
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", zIndex: 1,
                    background: isCompleted ? "#22c55e" : (isCurrent ? "#3b82f6" : "#fff"),
                    border: isCurrent || isCompleted ? "none" : "2px solid #e2e8f0",
                    color: isCurrent || isCompleted ? "#fff" : "#cbd5e1",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700,
                  }}>
                    {isCompleted ? "✓" : idx + 1}
                  </div>
                  <div style={{ marginTop: 12, fontSize: 10, fontWeight: 700, color: isCurrent ? "#0f172a" : "#94a3b8", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.4px", maxWidth: 80 }}>
                    {s}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stage Action Button */}
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #f1f5f9" }}>
            {normalizedStage === "New Enquiry" && (
              <button onClick={() => setShowSiteVisitModal(true)} disabled={loading}
                style={{ padding: "12px 28px", background: "linear-gradient(135deg, #7c3aed, #6d28d9)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(124,58,237,0.3)" }}>
                🗓 Schedule Site Visit
              </button>
            )}
            {normalizedStage === "Site Visit Scheduled" && (
              <button onClick={() => setShowQuotationModal(true)} disabled={loading}
                style={{ padding: "12px 28px", background: "linear-gradient(135deg, #d97706, #b45309)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(217,119,6,0.3)" }}>
                📋 Submit Quotation
              </button>
            )}
            {normalizedStage === "Quotation Sent" && (
              <button onClick={() => setShowConfirmJobModal(true)} disabled={loading}
                style={{ padding: "12px 28px", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}>
                ✅ Confirm Job
              </button>
            )}
            {normalizedStage === "Job Scheduled" && (
              <button onClick={() => advanceStage("First Visit")} disabled={loading}
                style={{ padding: "12px 28px", background: "linear-gradient(135deg, #ea580c, #c2410c)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(234,88,12,0.3)" }}>
                🔧 Mark First Visit Done
              </button>
            )}
            {normalizedStage === "First Visit" && (
              <button onClick={() => advanceStage("Completed")} disabled={loading}
                style={{ padding: "12px 28px", background: "linear-gradient(135deg, #059669, #047857)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(5,150,105,0.3)" }}>
                🏆 Mark as Completed
              </button>
            )}
            {normalizedStage === "Completed" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", background: "#f0fdf4", borderRadius: 10, border: "1px solid #bbf7d0", color: "#16a34a", fontWeight: 700, fontSize: 14 }}>
                🏆 Job Successfully Completed
              </div>
            )}
          </div>
        </div>

        {/* ── MAIN INFO GRID ── */}
        <form onSubmit={handleSaveFields}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>

            {/* Customer Card */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 24 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 20 }}>Customer Profile</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Name</div>
                  <Link href={`/dashboard/customers/${job.customer_id}`} style={{ fontSize: 16, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>
                    {job.customers?.name}
                  </Link>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Phone</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>{job.customers?.phone || "N/A"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Address</div>
                  <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.5 }}>{job.customers?.address || "N/A"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Unit Type</div>
                  {isEditing ? (
                    <select name="unit_type" defaultValue={job.customers?.unit_type || ""} className="form-input">
                      <option value="">-- Select --</option>
                      {UNIT_TYPES.map((ut) => <option key={ut} value={ut}>{ut}</option>)}
                    </select>
                  ) : (
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                      background: job.customers?.unit_type ? "#eff6ff" : "#f8fafc",
                      color: job.customers?.unit_type ? "#2563eb" : "#94a3b8",
                      border: "1px solid " + (job.customers?.unit_type ? "#bfdbfe" : "#e2e8f0")
                    }}>
                      {job.customers?.unit_type || "Not specified"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Service Card */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 24 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 20 }}>Service Details</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Service Type</div>
                  {isEditing ? (
                    <select name="service_type" defaultValue={job.service_type} className="form-input">
                      <option value="Installation">Installation</option>
                      <option value="Servicing">Servicing</option>
                    </select>
                  ) : (
                    <span style={{ fontSize: 14, fontWeight: 700, background: "#f1f5f9", color: "#475569", padding: "4px 12px", borderRadius: 6 }}>{job.service_type}</span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>AC Brand</div>
                  {isEditing ? (
                    <input name="ac_brand" defaultValue={job.ac_brand} placeholder="Brand" className="form-input" />
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{job.ac_brand || "TBD"}</div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Number of Units</div>
                  {isEditing ? (
                    <input type="number" name="unit_count" defaultValue={job.unit_count} className="form-input" />
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{job.unit_count} Unit(s)</div>
                  )}
                </div>
              </div>
            </div>

            {/* Assignment Card */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 24 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 20 }}>Assignment</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Assigned Staff</div>
                  {isEditing && userRole === "admin" ? (
                    <select name="assigned_to" defaultValue={job.assigned_to} className="form-input">
                      <option value="">Unassigned</option>
                      {staffProfiles.map((s: any) => <option key={s.id} value={s.id}>{s.full_name || s.name || s.email}</option>)}
                    </select>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#475569", border: "1px solid #e2e8f0" }}>
                        {(staffName || "U").substring(0, 1).toUpperCase()}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{staffName || "Unassigned"}</div>
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Visit Date</div>
                    {isEditing && userRole === "admin" ? <input type="date" name="visit_date" defaultValue={job.visit_date} className="form-input" /> : <div style={{ fontSize: 13, fontWeight: 600 }}>{job.visit_date || "TBD"}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Job Date</div>
                    {isEditing && userRole === "admin" ? <input type="date" name="job_date" defaultValue={job.job_date} className="form-input" /> : <div style={{ fontSize: 13, fontWeight: 600 }}>{job.job_date || "TBD"}</div>}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {job.visit_time && (
                    <div style={{ paddingTop: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Visit Time</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{job.visit_time}</div>
                    </div>
                  )}
                  {job.job_time && (
                    <div style={{ paddingTop: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Job Time</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{job.job_time}</div>
                    </div>
                  )}
                </div>
                {job.visit_phone && (

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Visit Contact</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{job.visit_phone}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Card */}
            {userRole === "admin" && (
            <div style={{ background: "#f8fafc", borderRadius: 16, border: "1px solid #e2e8f0", padding: 24 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 20 }}>Payment & Deposit</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>Quoted Amount</span>
                  {isEditing ? <input name="quoted_amount" defaultValue={job.quoted_amount} style={{ width: 90, textAlign: "right" }} className="form-input" /> : <span style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>${Number(job.quoted_amount || 0).toFixed(2)}</span>}
                </div>
                <div style={{ height: 1, background: "#e2e8f0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>Deposit Amount</span>
                  {isEditing ? <input name="deposit_amount" defaultValue={job.deposit_amount || 0} style={{ width: 90, textAlign: "right" }} className="form-input" /> : <span style={{ fontSize: 15, fontWeight: 700, color: "#475569" }}>${Number(job.deposit_amount || 0).toFixed(2)}</span>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>Deposit Collected</span>
                  {isEditing ? <input name="deposit_collected" defaultValue={job.deposit_collected || 0} style={{ width: 90, textAlign: "right" }} className="form-input" /> : <span style={{ fontSize: 15, fontWeight: 700, color: "#059669" }}>${Number(job.deposit_collected || 0).toFixed(2)}</span>}
                </div>
                <div style={{ height: 1, background: "#e2e8f0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Remaining Balance</span>
                  <span style={{ fontSize: 18, fontWeight: 900, color: remaining > 0 ? "#f59e0b" : "#10b981" }}>${remaining.toFixed(2)}</span>
                </div>
                <div style={{ height: 1, background: "#e2e8f0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>Payment Status</span>
                  {userRole === "admin" && isEditing ? (
                    <select name="payment_status" defaultValue={job.payment_status || "Pending"} className="form-input" style={{ width: 120 }}>
                      <option value="Pending">Pending</option>
                      <option value="Paid">Paid</option>
                    </select>
                  ) : (
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6,
                      background: job.payment_status === "Paid" ? "#dcfce7" : "#fefce8",
                      color: job.payment_status === "Paid" ? "#166534" : "#854d0e",
                      border: `1px solid ${job.payment_status === "Paid" ? "#bbf7d0" : "#fde68a"}`
                    }}>
                      {job.payment_status || "Pending"}
                    </span>
                  )}
                </div>
              </div>
            </div>
            )}
          </div>

          {/* Notes */}
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 24, marginTop: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16 }}>Service Notes</h3>
            {isEditing ? (
              <textarea name="notes" defaultValue={job.notes} rows={4} className="form-input" style={{ width: "100%" }} />
            ) : (
              <p style={{ margin: 0, fontSize: 15, color: "#334155", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{job.notes || "No notes provided."}</p>
            )}
          </div>

          {isEditing && (
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <button type="button" onClick={() => setIsEditing(false)} style={{ flex: 1, padding: 14, background: "#f1f5f9", color: "#475569", borderRadius: 10, fontWeight: 700, border: "none", cursor: "pointer", fontSize: 14 }}>Cancel</button>
              <button type="submit" disabled={loading} style={{ flex: 2, padding: 14, background: "#0f172a", color: "#fff", borderRadius: 10, fontWeight: 700, border: "none", cursor: "pointer", fontSize: 14 }}>
                {loading ? "Saving..." : "Save All Changes"}
              </button>
            </div>
          )}
        </form>

        {/* ── MATERIAL LOGGING ── */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>Materials Used</h3>
            {!canLogMaterials && (
              <span style={{ fontSize: 11, color: "#94a3b8", background: "#f8fafc", border: "1px solid #e2e8f0", padding: "3px 10px", borderRadius: 6, fontWeight: 600 }}>
                Available at Job Scheduled stage
              </span>
            )}
          </div>
          {!canLogMaterials ? (
            <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13, background: "#f8fafc", borderRadius: 12, border: "1px dashed #cbd5e1" }}>
              📋 Materials are logged once the job is scheduled or in progress.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {materials.length === 0 ? (
                <div style={{ padding: 16, textAlign: "center", color: "#94a3b8", fontSize: 13, background: "#f8fafc", borderRadius: 10, border: "1px dashed #cbd5e1" }}>No materials logged yet.</div>
              ) : (
                materials.map((m: any) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{m.inventory_items?.name}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Qty: {m.quantity_used} {m.inventory_items?.unit}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#475569" }}>${(m.price_at_time * m.quantity_used).toFixed(2)}</div>
                      <button type="button" onClick={() => handleRemoveMaterial(m.id, m.item_id, m.quantity_used)} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 4, borderRadius: 6, lineHeight: 0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
              <div style={{ display: "flex", gap: 8, paddingTop: 4, borderTop: "1px dashed #e2e8f0", marginTop: 4 }}>
                <select className="form-input" style={{ flex: 1, fontSize: 13 }} value={selectedItem} onChange={(e) => setSelectedItem(e.target.value)}>
                  <option value="">+ Add inventory item...</option>
                  {inventory.map((inv) => (
                    <option key={inv.id} value={inv.id} disabled={inv.stock_quantity <= 0}>
                      {inv.name} ({inv.stock_quantity} {inv.unit} available)
                    </option>
                  ))}
                </select>
                <input type="number" className="form-input" style={{ width: 64, fontSize: 13 }} placeholder="Qty" min={1} value={useQty} onChange={(e) => setUseQty(e.target.value)} />
                <button type="button" onClick={handleAddMaterial} disabled={!selectedItem || !useQty || matLoading}
                  style={{ padding: "0 16px", background: selectedItem && useQty ? "#0f172a" : "#e2e8f0", color: selectedItem && useQty ? "#fff" : "#94a3b8", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: selectedItem && useQty ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
                  {matLoading ? "..." : "Log"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── CRM & TRACKING (collapsed panel) ── */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <button type="button" onClick={() => setShowCRMPanel(!showCRMPanel)}
            style={{ width: "100%", padding: "18px 24px", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.5px" }}>CRM & Tracking</span>
            <span style={{ fontSize: 18, color: "#94a3b8", transition: "transform 0.2s", transform: showCRMPanel ? "rotate(180deg)" : "none" }}>⌄</span>
          </button>
          {showCRMPanel && (
            <form onSubmit={handleSaveFields}>
              <div style={{ padding: "0 24px 24px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, borderTop: "1px solid #f1f5f9" }}>
                <div style={{ paddingTop: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Priority</div>
                  {isEditing ? (
                    <select name="priority" defaultValue={job.priority} className="form-input">
                      {["Low", "Medium", "High", "Urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 800, color: job.priority === "Urgent" ? "#ef4444" : (job.priority === "High" ? "#f59e0b" : "#3b82f6"), textTransform: "uppercase" }}>{job.priority}</span>
                  )}
                </div>
                <div style={{ paddingTop: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Source</div>
                  {isEditing ? (
                    <select name="source" defaultValue={job.source} className="form-input">
                      {["WhatsApp", "Call", "Referral", "Website", "Facebook", "Other"].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>{job.source}</span>
                  )}
                </div>
                <div style={{ paddingTop: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Service Report #</div>
                  {isEditing ? (
                    <input name="service_report_no" defaultValue={job.service_report_no} className="form-input" />
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", fontFamily: "monospace" }}>{job.service_report_no || "NOT FILED"}</div>
                  )}
                </div>
                <div style={{ paddingTop: 20, gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Internal Notes</div>
                  {isEditing ? (
                    <textarea name="internal_notes" defaultValue={job.internal_notes} rows={2} className="form-input" style={{ width: "100%" }} />
                  ) : (
                    <div style={{ fontSize: 13, color: "#64748b", fontStyle: "italic" }}>{job.internal_notes || "No internal notes."}</div>
                  )}
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ══ SITE VISIT MODAL ══ */}
      {showSiteVisitModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 32, width: "100%", maxWidth: 480, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🗓</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: "0 0 6px 0" }}>Schedule Site Visit</h3>
            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px 0" }}>Fill in the visit details. Address and phone are pre-filled from the customer record.</p>
            <form onSubmit={handleSiteVisitSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Visit Date *</label>
                  <input type="date" required className="form-input" value={svDate} onChange={(e) => setSvDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Time</label>
                  <input type="time" className="form-input" value={svTime} onChange={(e) => setSvTime(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Contact Phone</label>
                <input className="form-input" placeholder="Customer phone..." value={svPhone} onChange={(e) => setSvPhone(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <input className="form-input" placeholder="Visit address..." value={svAddress} onChange={(e) => setSvAddress(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <button type="button" onClick={() => setShowSiteVisitModal(false)} style={{ flex: 1, padding: 13, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#475569" }}>Cancel</button>
                <button type="submit" disabled={loading} style={{ flex: 2, padding: 13, borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  {loading ? "Scheduling..." : "Schedule & Move to Site Visit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ QUOTATION MODAL ══ */}
      {showQuotationModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 32, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: "0 0 6px 0" }}>Submit Quotation</h3>
            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px 0" }}>Confirm service details — a WhatsApp template will be generated for you to send to the customer.</p>
            <form onSubmit={handleQuotationSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Quoted Amount ($) *</label>
                  <input type="number" step="0.01" required className="form-input" style={{ fontWeight: 700, color: "#2563eb" }} value={qAmount} onChange={(e) => setQAmount(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Engineer Name</label>
                  <input className="form-input" placeholder="Jackie" value={qEngineer} onChange={(e) => setQEngineer(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Quotation Breakdown (Equipment & Pricing)</label>
                <textarea className="form-input" rows={12} value={qCustomBreakdown} onChange={(e) => setQCustomBreakdown(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Upgraded Materials</label>
                <textarea className="form-input" rows={5} value={qMaterials} onChange={(e) => setQMaterials(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Warranty Details</label>
                <textarea className="form-input" rows={3} value={qWarranty} onChange={(e) => setQWarranty(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Additional Notes (private notes)</label>
                <textarea className="form-input" rows={2} placeholder="Internal details..." value={qNotes} onChange={(e) => setQNotes(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <button type="button" onClick={() => setShowQuotationModal(false)} style={{ flex: 1, padding: 13, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#475569" }}>Cancel</button>
                <button type="submit" disabled={loading} style={{ flex: 2, padding: 13, borderRadius: 10, border: "none", background: "linear-gradient(135deg,#d97706,#b45309)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  {loading ? "Generating..." : "Generate WhatsApp Template →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ WHATSAPP TEMPLATE MODAL ══ */}
      {showWhatsAppTemplate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 32, width: "100%", maxWidth: 560, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto" }}>
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
              <button onClick={() => setShowWhatsAppTemplate(false)} style={{ flex: 1, padding: 13, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#475569" }}>Close</button>
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
      )}

      {/* ══ INVOICE MODAL ══ */}
      {showInvoiceModal && (
        <InvoicePreviewModal job={job} onClose={() => setShowInvoiceModal(false)} />
      )}

      {/* ══ CONFIRM JOB MODAL ══ */}
      {showConfirmJobModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 32, width: "100%", maxWidth: 460, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: "0 0 6px 0" }}>Confirm Job</h3>
            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px 0" }}>Enter the confirmed job date and deposit details to proceed.</p>
            <form onSubmit={handleConfirmJobSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Job Date *</label>
                  <input type="date" required className="form-input" value={cjDate} onChange={(e) => setCjDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Job Time</label>
                  <input type="time" className="form-input" value={cjTime} onChange={(e) => setCjTime(e.target.value)} />
                </div>
              </div>

              <div style={{ background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Deposit Details</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Deposit Amount ($)</label>
                    <input type="number" step="0.01" className="form-input" value={cjDeposit} onChange={(e) => setCjDeposit(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Amount Collected ($)</label>
                    <input type="number" step="0.01" className="form-input" value={cjCollected} onChange={(e) => setCjCollected(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b" }}>
                  <span>Quoted:</span><span style={{ fontWeight: 700, color: "#0f172a" }}>${Number(job.quoted_amount || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b" }}>
                  <span>Remaining after deposit:</span>
                  <span style={{ fontWeight: 700, color: "#f59e0b" }}>${Math.max(0, Number(job.quoted_amount || 0) - cjCollected).toFixed(2)}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <button type="button" onClick={() => setShowConfirmJobModal(false)} style={{ flex: 1, padding: 13, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#475569" }}>Cancel</button>
                <button type="submit" disabled={loading} style={{ flex: 2, padding: 13, borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  {loading ? "Confirming..." : "Confirm & Schedule Job →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

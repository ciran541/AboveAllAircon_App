"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import InvoicePreviewModal from "@/components/InvoicePreviewModal";
import { SiteVisitModal, QuotationModal, WhatsAppTemplateModal, ConfirmJobModal, SecondVisitModal, CompleteJobModal } from "@/components/StageModals";
import { updateJobFields, deleteJob as deleteJobAction } from "@/app/actions/jobActions";
import { logJobMaterial, removeJobMaterial } from "@/app/actions/inventoryActions";
import { updateCustomerDetails } from "@/app/actions/customerActions";
import { JOB_STAGES as STAGES, getStageDisplay, getStageDB, UNIT_TYPES } from "@/lib/constants";

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
  const [documentMode, setDocumentMode] = useState<"invoice" | "quotation">("invoice");
  const [showSecondVisitModal, setShowSecondVisitModal] = useState(false);
  const [showCompleteJobModal, setShowCompleteJobModal] = useState(false);
  const [targetStage, setTargetStage] = useState<string>("");
  const [whatsappText, setWhatsappText] = useState("");

  // Material management
  const [inventory, setInventory] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState("");
  const [useQty, setUseQty] = useState("");
  const [matLoading, setMatLoading] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  const normalizedStage = getStageDisplay(job.stage);
  const stageIndex = STAGES.indexOf(normalizedStage as any);

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
    const dbStage = getStageDB(newStage);
    const updates = { stage: dbStage, ...extraFields };
    const oldJob = { ...job };

    // Optimistic update — reflect new stage immediately
    setJob((prev: any) => ({ ...prev, ...updates }));
    setLoading(true);

    const result = await updateJobFields(job.id, updates);

    if (result.error) {
      alert("Error saving stage update: " + result.error);
      setJob(oldJob); // Rollback
    } else if (result.data) {
      setJob((prev: any) => ({ ...prev, ...result.data }));
      if (result.calendarError) {
        alert("Stage saved, but Google Calendar sync failed: " + result.calendarError);
      }
    }
    setLoading(false);
  };

  // ── Site Visit submit ──────────────────────────────────────
  const handleSiteVisitSubmit = async (updates: any) => {
    await advanceStage("Site Visit Scheduled", updates);
    setShowSiteVisitModal(false);
  };

  // ── Quotation submit ───────────────────────────────────────
  const handleQuotationSubmit = async (updates: any, wpText: string) => {
    const oldJob = { ...job };
    const finalUpdates = { stage: "Quotation Sent", ...updates };

    // Optimistic Update: Close modal and show WhatsApp template instantly
    setJob((prev: any) => ({ ...prev, ...finalUpdates }));
    setWhatsappText(wpText);
    setShowQuotationModal(false);
    setShowWhatsAppTemplate(true);

    setLoading(true);
    const { data, error } = await supabase.from("jobs")
      .update(finalUpdates)
      .eq("id", job.id)
      .select()
      .single();

    if (error) {
      alert("Error updating quotation: " + error.message);
      setJob(oldJob); // Rollback
      setShowWhatsAppTemplate(false);
      setShowQuotationModal(true); // Re-open for the user
    } else if (data) {
      setJob((prev: any) => ({ ...prev, ...data }));
    }
    setLoading(false);
  };

  // ── Confirm Job submit ─────────────────────────────────────
  const handleConfirmJobSubmit = async (updates: any) => {
    // Advance to "Job Scheduled" if currently in an earlier stage, 
    // otherwise just update fields in the current stage.
    const currentIdx = STAGES.indexOf(normalizedStage as any);
    const targetIdx = STAGES.indexOf("Job Scheduled");
    const targetStage = currentIdx < targetIdx ? "Job Scheduled" : normalizedStage;
    
    await advanceStage(targetStage, updates);
    setShowConfirmJobModal(false);
  };

  // ── Second Visit submit ────────────────────────────────────
  const handleSecondVisitSubmit = async (updates: any) => {
    await advanceStage("Second Visit", updates);
    setShowSecondVisitModal(false);
  };

  // ── Complete Job submit ────────────────────────────────────
  const handleCompleteJobSubmit = async (updates: any) => {
    // If user marks as "Paid" in the modal, we skip "Payment Pending" and go straight to "Completed"
    const targetStage = updates.payment_status === "Paid" ? "Completed" : "Job Done (Payment Pending)";
    await advanceStage(targetStage, updates);
    setShowCompleteJobModal(false);
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
    
    const result = await logJobMaterial(job.id, item.id, qty, {
      created_by: job.created_by,
      cost_at_time: item.unit_cost || 0,
      price_at_time: item.unit_price || 0,
    });
    
    if (result.success && result.data) {
      setMaterials((prev: any[]) => [...prev, result.data]);
      setInventory((prev) => prev.map((i) => i.id === selectedItem ? { ...i, stock_quantity: i.stock_quantity - qty } : i));
      setSelectedItem(""); setUseQty("");
    } else {
      alert("Error adding material: " + (result.error || "Unknown error"));
    }
    setMatLoading(false);
  };

  const handleRemoveMaterial = async (matId: string, itemId: string, qty: number) => {
    if (!confirm("Remove this material? Stock will be returned to inventory.")) return;
    const result = await removeJobMaterial(matId, itemId, qty);
    if (result.success) {
      setMaterials((prev: any[]) => prev.filter((m) => m.id !== matId));
      setInventory((prev) => prev.map((i) => i.id === itemId ? { ...i, stock_quantity: i.stock_quantity + qty } : i));
    } else {
      alert("Error removing material: " + (result.error || "Unknown error"));
    }
  };

  // ── Edit field save (admin edit form) ─────────────────────
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
    if (fd.has("quoted_amount")) updates.quoted_amount = parseFloat(fd.get("quoted_amount") as string) || 0;
    if (fd.has("deposit_collected")) updates.deposit_collected = parseFloat(fd.get("deposit_collected") as string) || 0;
    if (fd.has("assigned_to")) updates.assigned_to = fd.get("assigned_to") || null;
    if (fd.has("visit_date")) updates.visit_date = fd.get("visit_date") || null;
    if (fd.has("job_date")) updates.job_date = fd.get("job_date") || null;

    // Customer unit_type update via server action
    const unitType = fd.get("unit_type");
    if (unitType !== null && job.customer_id) {
      await updateCustomerDetails(job.customer_id, { unit_type: (unitType as string) || null });
    }

    if (userRole === "admin") {
      const ps = fd.get("payment_status");
      if (ps) {
        updates.payment_status = ps;
        if (ps === "Paid" && job.payment_status !== "Paid") updates.payment_collected_at = new Date().toISOString();
        else if (ps === "Pending" && job.payment_status === "Paid") updates.payment_collected_at = null;
      }
    }

    // Route through server action so calendar sync runs
    const result = await updateJobFields(job.id, updates);
    if (!result.error && result.data) {
      const newStaff = staffProfiles.find((s: any) => s.id === result.data.assigned_to);
      setJob({ ...job, ...result.data, assigned_staff: newStaff || null });
      setIsEditing(false);
      if (result.calendarError) {
        alert("Changes saved, but Google Calendar sync failed: " + result.calendarError);
      }
    } else {
      alert(result.error);
    }
    setLoading(false);
  };

  const resolvedStaff = job.assigned_staff || staffProfiles.find((s: any) => s.id === job.assigned_to);
  const staffName = resolvedStaff ? (resolvedStaff.full_name || resolvedStaff.name || resolvedStaff.email) : null;
  const remaining = (Number(job.quoted_amount) || 0) - (Number(job.deposit_collected) || 0);

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
            {userRole === "admin" && stageIndex >= STAGES.indexOf("Quotation Sent") && (
              <>
                <button
                  onClick={() => { setDocumentMode("quotation"); setShowInvoiceModal(true); }}
                  style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #f59e0b, #d97706)", fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(245, 158, 11, 0.3)" }}
                >
                  📄 Preview & Download Quotation
                </button>
                <button
                  onClick={() => {
                    if (!job.job_date) {
                      setShowConfirmJobModal(true);
                      return;
                    }
                    setDocumentMode("invoice");
                    setShowInvoiceModal(true);
                  }}
                  style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #10b981, #059669)", fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)" }}
                >
                  📄 Preview & Download Invoice
                </button>
              </>
            )}
            <button onClick={() => setIsEditing(!isEditing)} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 600, color: "#475569", cursor: "pointer" }}>
              {isEditing ? "Cancel Edit" : "Edit Details"}
            </button>
            {!isEditing && (
              <button
                style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#ef4444", fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer" }}
                onClick={async () => {
                  if (confirm("Delete this job permanently? This will also remove all Google Calendar events.")) {
                    const result = await deleteJobAction(job.id);
                    if (result.error) {
                      alert("Error deleting job: " + result.error);
                    } else {
                      router.push("/dashboard/jobs");
                    }
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
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={() => setShowQuotationModal(true)} disabled={loading}
                  style={{ padding: "12px 28px", background: "linear-gradient(135deg, #14b8a6, #0d9488)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(20,184,166,0.3)" }}>
                  📄 Update Quotation
                </button>
                <button onClick={() => setShowConfirmJobModal(true)} disabled={loading}
                  style={{ padding: "12px 28px", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}>
                  ✅ Confirm Job
                </button>
              </div>
            )}
            {normalizedStage === "Job Scheduled" && (
              <button onClick={() => advanceStage("First Visit")} disabled={loading}
                style={{ padding: "12px 28px", background: "linear-gradient(135deg, #ea580c, #c2410c)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(234,88,12,0.3)" }}>
                🔧 Mark First Visit Done
              </button>
            )}
            {normalizedStage === "First Visit" && (
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={() => setShowSecondVisitModal(true)} disabled={loading}
                  style={{ padding: "12px 28px", background: "linear-gradient(135deg, #059669, #047857)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(5,150,105,0.3)" }}>
                  📅 Schedule Second Visit
                </button>
                <button onClick={() => { setTargetStage("Job Done (Payment Pending)"); setShowCompleteJobModal(true); }} disabled={loading}
                  style={{ padding: "12px 28px", background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}>
                  ✅ Mark Job Done (Pay Pending)
                </button>
              </div>
            )}
            {normalizedStage === "Second Visit" && (
              <button onClick={() => { setTargetStage("Job Done (Payment Pending)"); setShowCompleteJobModal(true); }} disabled={loading}
                style={{ padding: "12px 28px", background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}>
                ✅ Mark Job Done (Pay Pending)
              </button>
            )}
            {normalizedStage === "Job Done (Payment Pending)" && (
              <button onClick={() => { setTargetStage("Completed"); setShowCompleteJobModal(true); }} disabled={loading}
                style={{ padding: "12px 28px", background: "linear-gradient(135deg, #059669, #047857)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(5,150,105,0.3)" }}>
                💰 Confirm Final Payment
              </button>
            )}
            {normalizedStage === "Completed" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", background: "#f0fdf4", borderRadius: 10, border: "1px solid #bbf7d0", color: "#16a34a", fontWeight: 700, fontSize: 14 }}>
                🏆 Job Fully Completed & Paid
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
        <SiteVisitModal job={job} loading={loading} onClose={() => setShowSiteVisitModal(false)} onSubmit={handleSiteVisitSubmit} />
      )}

      {/* ══ QUOTATION MODAL ══ */}
      {showQuotationModal && (
        <QuotationModal job={job} loading={loading} onClose={() => setShowQuotationModal(false)} onSubmit={handleQuotationSubmit} />
      )}

      {/* ══ WHATSAPP TEMPLATE MODAL ══ */}
      {showWhatsAppTemplate && (
        <WhatsAppTemplateModal whatsappText={whatsappText} onClose={() => setShowWhatsAppTemplate(false)} />
      )}

      {/* ══ INVOICE MODAL ══ */}
      {showInvoiceModal && (
        <InvoicePreviewModal job={job} onClose={() => setShowInvoiceModal(false)} documentType={documentMode} onUpdateJob={(updates) => setJob({ ...job, ...updates })} />
      )}

      {/* ══ CONFIRM JOB MODAL ══ */}
      {showConfirmJobModal && (
        <ConfirmJobModal job={job} loading={loading} onClose={() => setShowConfirmJobModal(false)} onSubmit={handleConfirmJobSubmit} />
      )}

      {/* ══ SECOND VISIT MODAL ══ */}
      {showSecondVisitModal && (
        <SecondVisitModal job={job} loading={loading} onClose={() => setShowSecondVisitModal(false)} onSubmit={handleSecondVisitSubmit} />
      )}

      {/* ══ COMPLETE JOB MODAL ══ */}
      {showCompleteJobModal && (
        <CompleteJobModal job={job} loading={loading} targetStage={targetStage} onClose={() => setShowCompleteJobModal(false)} onSubmit={handleCompleteJobSubmit} />
      )}
    </>
  );
}

/**
 * Next.js loading skeleton for the Salary page.
 * Displayed instantly by the framework while the server component fetches data.
 */
export default function SalaryLoading() {
  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="skel skel-text-xl" style={{ width: 160 }} />
          <div className="skel skel-text-sm" style={{ width: 220 }} />
        </div>
        <div className="skel" style={{ width: 160, height: 40, borderRadius: 8 }} />
      </div>

      {/* Worker rows with OT/bonus summary */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 16, alignItems: "center", padding: "16px 20px", borderTop: i === 0 ? "none" : "1px solid #f1f5f9" }}>
            <div className="skel skel-text" style={{ width: "60%" }} />
            <div className="skel skel-text-sm" style={{ width: "50%" }} />
            <div className="skel skel-text-sm" style={{ width: "50%" }} />
            <div className="skel skel-text-sm" style={{ width: "50%" }} />
            <div className="skel" style={{ width: 90, height: 30, borderRadius: 8, marginLeft: "auto" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

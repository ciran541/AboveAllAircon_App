/**
 * Next.js loading skeleton for the Inventory page.
 * Displayed instantly by the framework while the server component fetches data.
 */
export default function InventoryLoading() {
  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="skel skel-text-xl" style={{ width: 160 }} />
          <div className="skel skel-text-sm" style={{ width: 240 }} />
        </div>
        <div className="skel" style={{ width: 130, height: 40, borderRadius: 8 }} />
      </div>

      {/* Item cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 32 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skel-card" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18 }}>
            <div className="skel skel-text" style={{ width: "70%" }} />
            <div className="skel skel-text-sm" style={{ width: "40%" }} />
            <div className="skel skel-text-sm" style={{ width: "55%" }} />
          </div>
        ))}
      </div>

      {/* Recent logs */}
      <div className="skel skel-text" style={{ width: 140, marginBottom: 14 }} />
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "14px 20px", borderTop: i === 0 ? "none" : "1px solid #f1f5f9" }}>
            <div className="skel skel-text" style={{ width: "40%" }} />
            <div className="skel skel-text-sm" style={{ width: "20%" }} />
            <div className="skel skel-text-sm" style={{ width: 70 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

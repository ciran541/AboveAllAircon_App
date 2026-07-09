/**
 * Next.js loading skeleton for the Analytics page.
 * Displayed instantly by the framework while the server component fetches data.
 */
export default function AnalyticsLoading() {
  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="skel skel-text-xl" style={{ width: 200 }} />

      {/* KPI row */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ background: "#fff", border: "1px solid #e4e9f0", borderRadius: 12, padding: "18px 20px", flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="skel skel-text-sm" style={{ width: "60%" }} />
            <div className="skel skel-text-xl" style={{ width: "50%" }} />
            <div className="skel skel-text-sm" style={{ width: "40%" }} />
          </div>
        ))}
      </div>

      {/* Chart cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} style={{ background: "#fff", border: "1px solid #e4e9f0", borderRadius: 12, padding: "18px 20px" }}>
            <div className="skel skel-text" style={{ width: 140, marginBottom: 16 }} />
            <div className="skel" style={{ width: "100%", height: 220, borderRadius: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Next.js loading skeleton for the Calendar Sync Log page.
 * Displayed instantly by the framework while the server component fetches data.
 */
export default function LogsLoading() {
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        <div className="skel skel-text-xl" style={{ width: 240 }} />
        <div className="skel skel-text-sm" style={{ width: 320 }} />
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div className="skel" style={{ flex: 1, maxWidth: 340, height: 38, borderRadius: 8 }} />
        <div className="skel" style={{ width: 150, height: 38, borderRadius: 8 }} />
        <div className="skel" style={{ width: 150, height: 38, borderRadius: 8 }} />
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr 1fr",
              gap: 16,
              alignItems: "center",
              padding: "14px 16px",
              borderTop: i === 0 ? "none" : "1px solid #f1f5f9",
            }}
          >
            <div className="skel skel-text-sm" style={{ width: "80%" }} />
            <div className="skel skel-text" style={{ width: "65%" }} />
            <div className="skel skel-text-sm" style={{ width: "50%" }} />
            <div className="skel" style={{ width: 76, height: 22, borderRadius: 20 }} />
            <div className="skel skel-text-sm" style={{ width: 50 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

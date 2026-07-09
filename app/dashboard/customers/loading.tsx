/**
 * Next.js loading skeleton for the Customer Directory page.
 * Displayed instantly by the framework while the server component fetches data.
 */
export default function CustomersLoading() {
  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="skel skel-text-xl" style={{ width: 220 }} />
          <div className="skel skel-text-sm" style={{ width: 260 }} />
        </div>
        <div className="skel" style={{ width: 140, height: 40, borderRadius: 8 }} />
      </div>

      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
          <div className="skel" style={{ maxWidth: 400, height: 38, borderRadius: 8 }} />
        </div>
        <div style={{ padding: "0 20px" }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 2fr 1fr 1fr", gap: 16, padding: "16px 0", borderTop: i === 0 ? "none" : "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="skel skel-text" style={{ width: "70%" }} />
                <div className="skel skel-text-sm" style={{ width: "50%" }} />
              </div>
              <div className="skel skel-text" style={{ width: "60%" }} />
              <div className="skel skel-text" style={{ width: "80%" }} />
              <div className="skel" style={{ width: 40, height: 20, borderRadius: 20, margin: "0 auto" }} />
              <div className="skel skel-text-sm" style={{ width: 40, marginLeft: "auto" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

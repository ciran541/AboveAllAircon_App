/**
 * Next.js loading skeleton for the Users (staff) page.
 * Displayed instantly by the framework while the server component fetches data.
 */
export default function UsersLoading() {
  return (
    <div style={{ padding: "24px", maxWidth: "1000px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="skel skel-text-xl" style={{ width: 180 }} />
          <div className="skel skel-text-sm" style={{ width: 220 }} />
        </div>
        <div className="skel" style={{ width: 130, height: 40, borderRadius: 8 }} />
      </div>

      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderTop: i === 0 ? "none" : "1px solid #f1f5f9" }}>
            <div className="skel skel-circle" style={{ width: 36, height: 36 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <div className="skel skel-text" style={{ width: 160 }} />
              <div className="skel skel-text-sm" style={{ width: 200 }} />
            </div>
            <div className="skel" style={{ width: 70, height: 22, borderRadius: 20 }} />
            <div className="skel skel-text-sm" style={{ width: 40 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

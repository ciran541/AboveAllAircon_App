/**
 * Next.js loading skeleton for the Job Detail page.
 * Displayed instantly while the server fetches job data.
 * Matches the real layout: back link → header → stage timeline → info grid.
 */
export default function JobDetailLoading() {
  return (
    <div style={{ padding: "24px 40px", background: "#f8fafc", minHeight: "100vh" }}>
      {/* Back link */}
      <div style={{ marginBottom: 24 }}>
        <div className="skel skel-text" style={{ width: 130, height: 16 }} />
      </div>

      <div className="skel-detail" style={{ padding: 0 }}>
        {/* ── Header ── */}
        <div className="skel-detail-header">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="skel" style={{ width: 90, height: 22, borderRadius: 6 }} />
              <div className="skel skel-text-sm" style={{ width: 120 }} />
            </div>
            <div className="skel skel-text-xl" style={{ width: 260 }} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="skel" style={{ width: 200, height: 40, borderRadius: 8 }} />
            <div className="skel" style={{ width: 180, height: 40, borderRadius: 8 }} />
            <div className="skel" style={{ width: 100, height: 40, borderRadius: 8 }} />
          </div>
        </div>

        {/* ── Stage Timeline ── */}
        <div className="skel-stage-bar">
          <div className="skel skel-text-sm" style={{ width: 90, marginBottom: 20 }} />
          <div className="skel-stage-dots">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <div className="skel skel-circle" style={{ width: 32, height: 32 }} />
                <div className="skel skel-text-sm" style={{ width: 50 }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #f1f5f9" }}>
            <div className="skel" style={{ width: 200, height: 44, borderRadius: 10 }} />
          </div>
        </div>

        {/* ── Info Grid ── */}
        <div className="skel-info-grid">
          {/* Customer Card */}
          <div className="skel-info-card">
            <div className="skel skel-text" style={{ width: 120 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div className="skel skel-text-sm" style={{ width: 40, marginBottom: 6 }} />
                <div className="skel skel-text" style={{ width: "70%" }} />
              </div>
              <div>
                <div className="skel skel-text-sm" style={{ width: 40, marginBottom: 6 }} />
                <div className="skel skel-text" style={{ width: "50%" }} />
              </div>
              <div>
                <div className="skel skel-text-sm" style={{ width: 50, marginBottom: 6 }} />
                <div className="skel skel-text" style={{ width: "90%" }} />
              </div>
            </div>
          </div>

          {/* Service Card */}
          <div className="skel-info-card">
            <div className="skel skel-text" style={{ width: 110 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div className="skel skel-text-sm" style={{ width: 70, marginBottom: 6 }} />
                <div className="skel" style={{ width: 90, height: 26, borderRadius: 6 }} />
              </div>
              <div>
                <div className="skel skel-text-sm" style={{ width: 55, marginBottom: 6 }} />
                <div className="skel skel-text" style={{ width: "50%" }} />
              </div>
              <div>
                <div className="skel skel-text-sm" style={{ width: 90, marginBottom: 6 }} />
                <div className="skel skel-text" style={{ width: "30%" }} />
              </div>
            </div>
          </div>

          {/* Visit Schedule Card */}
          <div className="skel-info-card">
            <div className="skel skel-text" style={{ width: 100 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ borderLeft: "3px solid #e2e8f0", paddingLeft: 12 }}>
                <div className="skel skel-text-sm" style={{ width: 70, marginBottom: 8 }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="skel skel-text" style={{ width: "80%" }} />
                  <div className="skel skel-text" style={{ width: "60%" }} />
                </div>
              </div>
              <div style={{ borderLeft: "3px solid #e2e8f0", paddingLeft: 12 }}>
                <div className="skel skel-text-sm" style={{ width: 90, marginBottom: 8 }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="skel skel-text" style={{ width: "80%" }} />
                  <div className="skel skel-text" style={{ width: "60%" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Payment Card */}
          <div className="skel-info-card" style={{ background: "#f8fafc" }}>
            <div className="skel skel-text" style={{ width: 120 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div className="skel skel-text" style={{ width: 90 }} />
                <div className="skel skel-text-xl" style={{ width: 80 }} />
              </div>
              <div style={{ height: 1, background: "#e2e8f0" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div className="skel skel-text" style={{ width: 110 }} />
                <div className="skel skel-text" style={{ width: 60 }} />
              </div>
              <div style={{ height: 1, background: "#e2e8f0" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div className="skel skel-text" style={{ width: 100 }} />
                <div className="skel skel-text" style={{ width: 60 }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Notes Card ── */}
        <div className="skel-info-card" style={{ marginTop: 0 }}>
          <div className="skel skel-text" style={{ width: 100 }} />
          <div className="skel" style={{ width: "100%", height: 60, borderRadius: 8 }} />
        </div>
      </div>
    </div>
  );
}

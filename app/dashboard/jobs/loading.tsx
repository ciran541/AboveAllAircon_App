/**
 * Next.js loading skeleton for the Jobs Pipeline page.
 * Displayed instantly by the framework while the server component fetches data.
 * Matches the real pipeline layout so users see a familiar shape immediately.
 */
export default function JobsLoading() {
  const columns = 7; // matches the 7 job stages

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Header Skeleton ── */}
      <div style={{
        padding: "20px 28px", borderBottom: "1px solid #e4e9f0", background: "#fff",
        display: "flex", flexDirection: "column", gap: 16, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="skel skel-circle" style={{ width: 40, height: 40 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="skel skel-text-lg" style={{ width: 160 }} />
              <div className="skel skel-text-sm" style={{ width: 100 }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div className="skel" style={{ width: 180, height: 38, borderRadius: 10 }} />
            <div className="skel" style={{ width: 120, height: 38, borderRadius: 8 }} />
            <div className="skel" style={{ width: 110, height: 38, borderRadius: 8 }} />
          </div>
        </div>
        {/* Filter bar skeleton */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="skel" style={{ flex: 1, maxWidth: 300, height: 38, borderRadius: 8 }} />
          <div className="skel" style={{ width: 130, height: 38, borderRadius: 8 }} />
          <div className="skel" style={{ width: 120, height: 38, borderRadius: 8 }} />
          <div className="skel" style={{ width: 120, height: 38, borderRadius: 8 }} />
        </div>
      </div>

      {/* ── Pipeline Columns Skeleton ── */}
      <div style={{ flex: 1, padding: "24px 28px 0" }}>
        <div className="skel-pipeline-container">
          {Array.from({ length: columns }).map((_, colIdx) => (
            <div key={colIdx} className="skel-column">
              <div className="skel-column-header">
                <div className="skel skel-text" style={{ width: 90 }} />
                <div className="skel" style={{ width: 26, height: 20, borderRadius: 99 }} />
              </div>
              <div className="skel-column-cards">
                {/* Vary card count per column for realism */}
                {Array.from({ length: colIdx % 3 === 0 ? 3 : colIdx % 3 === 1 ? 2 : 1 }).map((_, cardIdx) => (
                  <div key={cardIdx} className="skel-card">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div className="skel skel-text" style={{ width: "60%", height: 16 }} />
                      <div className="skel" style={{ width: 60, height: 18, borderRadius: 99 }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div className="skel skel-text-sm" style={{ width: "75%" }} />
                      <div className="skel skel-text-sm" style={{ width: "55%" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

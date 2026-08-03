/**
 * Loading skeleton for the dashboard. Mirrors the real layout — header,
 * KPI row, day strip, run sheet — so the page does not jump when data lands.
 */
export default function OverviewLoading() {
  return (
    <div className="ov-page">
      <div className="skel skel-text-xl" style={{ width: 160 }} />
      <div className="skel skel-text-sm" style={{ width: 220, marginTop: 10 }} />

      <div className="stats-grid ov-stats" style={{ marginTop: 24 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-card" style={{ gap: 10 }}>
            <div className="skel skel-circle" style={{ width: 30, height: 30 }} />
            <div className="skel skel-text-sm" style={{ width: "65%" }} />
            <div className="skel skel-text-xl" style={{ width: "45%" }} />
            <div className="skel skel-text-sm" style={{ width: "55%" }} />
          </div>
        ))}
      </div>

      <div className="ov-strip">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="ov-strip-day" style={{ pointerEvents: "none" }}>
            <div className="skel skel-text-sm" style={{ width: 28 }} />
            <div className="skel skel-text-lg" style={{ width: 24, marginTop: 6 }} />
          </div>
        ))}
      </div>

      <div className="ov-runsheet" style={{ marginTop: 18 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="ov-run-row" style={{ alignItems: "center" }}>
            <div className="skel skel-text-sm" style={{ width: 56 }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="skel skel-text" style={{ width: "45%" }} />
              <div className="skel skel-text-sm" style={{ width: "70%" }} />
            </div>
            <div className="skel skel-text-sm" style={{ width: 80 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

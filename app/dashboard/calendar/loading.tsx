/**
 * Loading skeleton for the calendar. Renders a month-shaped grid so the
 * layout does not reflow when the real weeks arrive.
 */
export default function CalendarLoading() {
  return (
    <div className="cal-page">
      <div className="cal-toolbar">
        <div className="skel skel-text-xl" style={{ width: 180 }} />
        <div style={{ display: "flex", gap: 10 }}>
          <div className="skel" style={{ width: 120, height: 34, borderRadius: 8 }} />
          <div className="skel" style={{ width: 160, height: 34, borderRadius: 8 }} />
        </div>
      </div>

      <div className="cal-grid view-month" style={{ marginTop: 16 }}>
        {Array.from({ length: 5 }).map((_, week) => (
          <div key={week} className="cal-week">
            {Array.from({ length: 7 }).map((__, day) => (
              <div key={day} className="cal-cell" data-count={1}>
                <div className="skel skel-text-sm" style={{ width: 22 }} />
                <div className="skel" style={{ width: "100%", height: 18, borderRadius: 5, marginTop: 8 }} />
                <div className="skel" style={{ width: "80%", height: 18, borderRadius: 5, marginTop: 5 }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  APPOINTMENT_META,
  APPOINTMENT_TYPES,
  addDays,
  addMonths,
  CALENDAR_VIEWS,
  dayOfMonth,
  eachDay,
  formatDayLong,
  formatDayShort,
  formatMonthLong,
  formatTime,
  groupByDate,
  isWeekend,
  sortAppointments,
  type Appointment,
  type AppointmentType,
  type CalendarView,
} from "@/lib/appointments";
import { getStageDisplay } from "@/lib/constants";

interface CalendarClientProps {
  view: CalendarView;
  anchor: string;
  today: string;
  rangeFrom: string;
  rangeTo: string;
  appointments: Appointment[];
  engineers: string[];
  typeFilter: AppointmentType | "All";
  staffFilter: string;
}

/** Chips shown per month cell before collapsing into "+N more". */
const MONTH_CHIP_CAP = 3;

const WEEKDAY_HEADS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function IconChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function CalendarClient({
  view,
  anchor,
  today,
  rangeFrom,
  rangeTo,
  appointments,
  engineers,
  typeFilter,
  staffFilter,
}: CalendarClientProps) {
  const router = useRouter();

  const byDate = useMemo(() => groupByDate(appointments), [appointments]);

  /** Builds a URL for this calendar with some params replaced. */
  function hrefFor(next: Partial<{ view: CalendarView; date: string; type: string; staff: string }>) {
    const search = new URLSearchParams();
    const merged = {
      view: next.view ?? view,
      date: next.date ?? anchor,
      type: next.type ?? typeFilter,
      staff: next.staff ?? staffFilter,
    };
    search.set("view", merged.view);
    search.set("date", merged.date);
    if (merged.type !== "All") search.set("type", merged.type);
    if (merged.staff !== "All") search.set("staff", merged.staff);
    return `/dashboard/calendar?${search.toString()}`;
  }

  const step = view === "week" ? 7 : 1;
  const previousDate = view === "month" ? addMonths(anchor, -1) : addDays(anchor, -step);
  const nextDate = view === "month" ? addMonths(anchor, 1) : addDays(anchor, step);

  const heading =
    view === "month"
      ? formatMonthLong(anchor)
      : view === "week"
        ? `${formatDayShort(rangeFrom)} – ${formatDayShort(rangeTo)}`
        : formatDayLong(anchor);

  // Month and week share one grid; only the chip cap and row height differ.
  const weeks = useMemo(() => {
    if (view === "day") return [];
    const days = eachDay(rangeFrom, rangeTo);
    const rows: string[][] = [];
    for (let index = 0; index < days.length; index += 7) rows.push(days.slice(index, index + 7));
    return rows;
  }, [view, rangeFrom, rangeTo]);

  const dayAppointments = sortAppointments(byDate.get(anchor) ?? []);
  const currentMonth = anchor.slice(0, 7);

  return (
    <div className="cal-page page-fade-in">
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <header className="cal-toolbar">
        <div className="cal-toolbar-left">
          <h1 className="cal-heading">{heading}</h1>
          <span className="cal-count">
            {appointments.length} appointment{appointments.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="cal-toolbar-right">
          <div className="cal-nav">
            <Link
              href={hrefFor({ date: previousDate })}
              className="btn-icon-ghost"
              aria-label={`Previous ${view}`}
            >
              <IconChevronLeft />
            </Link>
            <Link href={hrefFor({ date: today })} className="btn-secondary cal-today-btn">
              Today
            </Link>
            <Link
              href={hrefFor({ date: nextDate })}
              className="btn-icon-ghost"
              aria-label={`Next ${view}`}
            >
              <IconChevronRight />
            </Link>
          </div>

          <div className="cal-view-switch" role="group" aria-label="Calendar view">
            {CALENDAR_VIEWS.map((option) => (
              <Link
                key={option}
                href={hrefFor({ view: option })}
                className={`cal-view-btn${option === view ? " active" : ""}`}
                aria-current={option === view ? "true" : undefined}
              >
                {option[0].toUpperCase() + option.slice(1)}
              </Link>
            ))}
          </div>

          <select
            className="pipeline-filter-select"
            value={typeFilter}
            aria-label="Filter by appointment type"
            onChange={(event) => router.push(hrefFor({ type: event.target.value }))}
          >
            <option value="All">All types</option>
            {APPOINTMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {APPOINTMENT_META[type].label}
              </option>
            ))}
          </select>

          <select
            className="pipeline-filter-select"
            value={staffFilter}
            aria-label="Filter by engineer"
            onChange={(event) => router.push(hrefFor({ staff: event.target.value }))}
          >
            <option value="All">All engineers</option>
            <option value="unassigned">Unassigned</option>
            {engineers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div className="cal-legend">
        {APPOINTMENT_TYPES.map((type) => (
          <span key={type} className="cal-legend-item">
            <span className={`cal-legend-swatch tone-${APPOINTMENT_META[type].tone}`} aria-hidden="true" />
            {APPOINTMENT_META[type].label}
          </span>
        ))}
        <span className="cal-legend-item">
          <span className="cal-legend-swatch unassigned" aria-hidden="true" />
          Unassigned
        </span>
      </div>

      {/* ── Grid / agenda ──────────────────────────────────────────────────── */}
      {view === "day" ? (
        <DayAgenda date={anchor} today={today} appointments={dayAppointments} />
      ) : (
        <div className={`cal-grid view-${view}`}>
          <div className="cal-grid-head" aria-hidden="true">
            {WEEKDAY_HEADS.map((label) => (
              <div key={label} className="cal-grid-head-cell">
                {label}
              </div>
            ))}
          </div>

          {weeks.map((week) => (
            <div key={week[0]} className="cal-week">
              {week.map((date) => {
                const dayItems = sortAppointments(byDate.get(date) ?? []);
                const cap = view === "month" ? MONTH_CHIP_CAP : dayItems.length;
                const hiddenCount = dayItems.length - Math.min(cap, dayItems.length);
                const outsideMonth = view === "month" && date.slice(0, 7) !== currentMonth;

                return (
                  <div
                    key={date}
                    className={[
                      "cal-cell",
                      date === today ? "is-today" : "",
                      outsideMonth ? "outside" : "",
                      isWeekend(date) ? "weekend" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-count={dayItems.length}
                  >
                    <Link href={hrefFor({ view: "day", date })} className="cal-cell-date">
                      <span className="cal-cell-daynum">{dayOfMonth(date)}</span>
                      <span className="cal-cell-dayname">{formatDayShort(date)}</span>
                    </Link>

                    <div className="cal-cell-chips">
                      {dayItems.slice(0, cap).map((appointment) => (
                        <Chip key={appointment.id} appointment={appointment} />
                      ))}
                      {hiddenCount > 0 && (
                        <Link href={hrefFor({ view: "day", date })} className="cal-chip-more">
                          +{hiddenCount} more
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Chip({ appointment }: { appointment: Appointment }) {
  const meta = APPOINTMENT_META[appointment.type];
  const time = formatTime(appointment.time);
  return (
    <Link
      href={`/dashboard/jobs/${appointment.jobId}`}
      className={`cal-chip tone-${meta.tone}${appointment.assignee ? "" : " unassigned"}`}
      title={`${meta.label}${time ? ` · ${time}` : ""} · ${appointment.customerName}${
        appointment.customerAddress ? ` · ${appointment.customerAddress}` : ""
      }`}
    >
      <span className="cal-chip-time">{time ?? meta.short}</span>
      <span className="cal-chip-name">{appointment.customerName}</span>
    </Link>
  );
}

function DayAgenda({
  date,
  today,
  appointments,
}: {
  date: string;
  today: string;
  appointments: Appointment[];
}) {
  if (appointments.length === 0) {
    return (
      <div className="empty-state">
        Nothing scheduled for {date === today ? "today" : formatDayShort(date)}.
      </div>
    );
  }

  return (
    <div className="cal-agenda">
      {appointments.map((appointment) => {
        const meta = APPOINTMENT_META[appointment.type];
        const time = formatTime(appointment.time);
        const assignee = appointment.assignee;

        return (
          <div
            key={appointment.id}
            className={`cal-agenda-row tone-${meta.tone}${assignee ? "" : " unassigned"}`}
          >
            <div className="cal-agenda-time">{time ?? "No time"}</div>
            <div className="cal-agenda-main">
              <div className="cal-agenda-line">
                <span className={`ov-type-badge tone-${meta.tone}`}>{meta.label}</span>
                <Link href={`/dashboard/jobs/${appointment.jobId}`} className="cal-agenda-customer">
                  {appointment.customerName}
                </Link>
                <span className="cal-agenda-stage">{getStageDisplay(appointment.stage)}</span>
              </div>
              <div className="cal-agenda-meta">
                {appointment.serviceType && <span>{appointment.serviceType}</span>}
                {appointment.customerAddress && <span>{appointment.customerAddress}</span>}
                {appointment.customerPhone && <span>{appointment.customerPhone}</span>}
              </div>
            </div>
            <div className="cal-agenda-assignee">
              {assignee ?? <span className="ov-assignee-none">Unassigned</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

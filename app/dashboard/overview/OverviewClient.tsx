"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  APPOINTMENT_META,
  APPOINTMENT_TYPES,
  addDays,
  formatCurrency,
  formatDayLong,
  formatDayShort,
  formatRelativeDay,
  formatTime,
  groupByDate,
  sortAppointments,
  weekdayShort,
  dayOfMonth,
  isWeekend,
  type Appointment,
} from "@/lib/appointments";
import { getStageDisplay } from "@/lib/constants";
import type { AttentionItem, AttentionLists } from "@/lib/attention";

interface OverviewClientProps {
  today: string;
  stripDays: number;
  appointments: Appointment[];
  attention: AttentionLists;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconUserX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" /><line x1="17" y1="8" x2="22" y2="13" /><line x1="22" y1="8" x2="17" y2="13" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconCash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconQuote() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconCheckCircle() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapsHref(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Strips spaces so `tel:` works with numbers stored as "9123 4567". */
function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OverviewClient({
  today,
  stripDays,
  appointments,
  attention,
}: OverviewClientProps) {
  const [selectedDate, setSelectedDate] = useState(today);

  const byDate = useMemo(() => groupByDate(appointments), [appointments]);
  const stripDates = useMemo(
    () => Array.from({ length: stripDays }, (_, index) => addDays(today, index)),
    [today, stripDays]
  );

  const selectedAppointments = useMemo(
    () => sortAppointments(byDate.get(selectedDate) ?? []),
    [byDate, selectedDate]
  );

  const todaysAppointments = byDate.get(today) ?? [];
  const todaysUnassigned = todaysAppointments.filter((a) => !a.assignee).length;

  // The run sheet reads best with timed work first and "someone needs to book
  // a time for these" collected at the end, rather than interleaved at 00:00.
  const timed = selectedAppointments.filter((a) => a.time);
  const untimed = selectedAppointments.filter((a) => !a.time);

  return (
    <div className="ov-page page-fade-in">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="ov-header">
        <div>
          <h1 className="ov-title">Today</h1>
          <p className="ov-subtitle">{formatDayLong(today)}</p>
        </div>
        <Link href="/dashboard/calendar" className="btn-secondary ov-header-action">
          <IconCalendar />
          Full calendar
        </Link>
      </header>

      {/* ── KPI row ────────────────────────────────────────────────────────── */}
      <div className="stats-grid ov-stats">
        <StatCard
          icon={<IconCalendar />}
          label="Today's appointments"
          value={String(todaysAppointments.length)}
          hint={
            todaysUnassigned > 0
              ? `${todaysUnassigned} with nobody assigned`
              : todaysAppointments.length > 0
                ? "All assigned"
                : "Nothing booked"
          }
          tone={todaysUnassigned > 0 ? "danger" : undefined}
        />
        <StatCard
          icon={<IconClock />}
          label={`Next ${stripDays} days`}
          value={String(appointments.length)}
          hint="Site visits, jobs and second visits"
        />
        <StatCard
          icon={<IconCash />}
          label="Still to collect"
          value={formatCurrency(attention.outstandingTotal)}
          hint={`Across ${attention.unpaid.length} job${attention.unpaid.length === 1 ? "" : "s"}`}
          tone={attention.outstandingTotal > 0 ? "warning" : undefined}
        />
        <StatCard
          icon={<IconUserX />}
          label="Needs attention"
          value={String(attention.total)}
          hint={attention.total === 0 ? "Nothing outstanding" : "Items across the four lists below"}
          tone={attention.total > 0 ? "warning" : undefined}
        />
      </div>

      {/* ── Day strip ──────────────────────────────────────────────────────── */}
      <div className="ov-strip" role="tablist" aria-label="Pick a day">
        {stripDates.map((date) => {
          const dayAppointments = byDate.get(date) ?? [];
          const isSelected = date === selectedDate;
          return (
            <button
              key={date}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls="ov-runsheet-panel"
              className={`ov-strip-day${isSelected ? " selected" : ""}${isWeekend(date) ? " weekend" : ""}`}
              onClick={() => setSelectedDate(date)}
            >
              <span className="ov-strip-weekday">{weekdayShort(date)}</span>
              <span className="ov-strip-date">{dayOfMonth(date)}</span>
              <span className="ov-strip-dots" aria-hidden="true">
                {APPOINTMENT_TYPES.map((type) => {
                  const count = dayAppointments.filter((a) => a.type === type).length;
                  if (count === 0) return null;
                  return (
                    <span key={type} className={`ov-dot tone-${APPOINTMENT_META[type].tone}`} />
                  );
                })}
              </span>
              <span className="ov-strip-count">
                {dayAppointments.length === 0 ? "—" : dayAppointments.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Run sheet ──────────────────────────────────────────────────────── */}
      <section className="ov-section" id="ov-runsheet-panel" role="tabpanel" tabIndex={-1}>
        <div className="ov-section-head">
          <h2 className="ov-section-title">
            Run sheet
            <span className="ov-section-sub">{formatRelativeDay(selectedDate, today)}</span>
          </h2>
          <Legend />
        </div>

        {selectedAppointments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconCalendar />
            </div>
            Nothing scheduled for {formatDayShort(selectedDate)}.
          </div>
        ) : (
          <div className="ov-runsheet">
            {timed.map((appointment) => (
              <RunSheetRow key={appointment.id} appointment={appointment} />
            ))}

            {untimed.length > 0 && (
              <>
                <div className="ov-runsheet-divider">
                  No time set ({untimed.length})
                </div>
                {untimed.map((appointment) => (
                  <RunSheetRow key={appointment.id} appointment={appointment} />
                ))}
              </>
            )}
          </div>
        )}
      </section>

      {/* ── Attention lists ────────────────────────────────────────────────── */}
      <section className="ov-section">
        <div className="ov-section-head">
          <h2 className="ov-section-title">
            Needs attention
            {attention.total > 0 && <span className="ov-section-sub">{attention.total} items</span>}
          </h2>
        </div>

        {attention.total === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon ov-all-clear">
              <IconCheckCircle />
            </div>
            Nothing needs chasing. Every booked job has someone assigned, no dates have slipped,
            and there is no money outstanding.
          </div>
        ) : (
          <div className="ov-attention-grid">
            <AttentionCard
              title="Nobody assigned"
              blurb="Booked in the next 7 days with no staff on it"
              icon={<IconUserX />}
              items={attention.unassigned}
              emptyText="Every upcoming appointment has someone on it."
              viewAllHref="/dashboard/jobs"
            />
            <AttentionCard
              title="Dates that slipped"
              blurb="The date passed but the stage never moved"
              icon={<IconClock />}
              items={attention.stalled}
              emptyText="Every job is where its dates say it should be."
              viewAllHref="/dashboard/jobs"
            />
            <AttentionCard
              title="Money to chase"
              blurb="Work done or deposits agreed, payment not in"
              icon={<IconCash />}
              items={attention.unpaid}
              emptyText="Nothing outstanding."
              viewAllHref="/dashboard/jobs?stage=Job%20Done%20(Payment%20Pending)"
              showAmount
            />
            <AttentionCard
              title="Quotes going cold"
              blurb="Expired, expiring, or sent with no reply"
              icon={<IconQuote />}
              items={attention.quotes}
              emptyText="No quotations need a follow-up."
              viewAllHref="/dashboard/jobs?stage=Quotation%20Sent"
              showAmount
            />
          </div>
        )}
      </section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "warning" | "danger";
}) {
  return (
    <div className={`stat-card ov-stat${tone ? ` tone-${tone}` : ""}`}>
      <div className="ov-stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="ov-stat-hint">{hint}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="ov-legend">
      {APPOINTMENT_TYPES.map((type) => (
        <span key={type} className="ov-legend-item">
          <span className={`ov-dot tone-${APPOINTMENT_META[type].tone}`} aria-hidden="true" />
          {APPOINTMENT_META[type].label}
        </span>
      ))}
    </div>
  );
}

function RunSheetRow({ appointment }: { appointment: Appointment }) {
  const meta = APPOINTMENT_META[appointment.type];
  const time = formatTime(appointment.time);
  const assignee = appointment.assignee;

  return (
    <div className={`ov-run-row${assignee ? "" : " unassigned"}`}>
      <div className="ov-run-time">{time ?? "—"}</div>

      <div className="ov-run-main">
        <div className="ov-run-line">
          <span className={`ov-type-badge tone-${meta.tone}`}>{meta.label}</span>
          <Link href={`/dashboard/jobs/${appointment.jobId}`} className="ov-run-customer">
            {appointment.customerName}
          </Link>
          <span className="ov-run-stage">{getStageDisplay(appointment.stage)}</span>
        </div>

        <div className="ov-run-meta">
          {appointment.serviceType && (
            <span className="ov-run-service">
              {appointment.serviceType}
              {appointment.unitCount ? ` · ${appointment.unitCount} unit${appointment.unitCount === 1 ? "" : "s"}` : ""}
            </span>
          )}
          {appointment.customerAddress && (
            <a
              className="ov-run-link"
              href={mapsHref(appointment.customerAddress)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconPin />
              {appointment.customerAddress}
            </a>
          )}
          {appointment.customerPhone && (
            <a className="ov-run-link" href={telHref(appointment.customerPhone)}>
              <IconPhone />
              {appointment.customerPhone}
            </a>
          )}
        </div>
      </div>

      <div className="ov-run-assignee">
        {assignee ? (
          <span className="ov-assignee-name">{assignee}</span>
        ) : (
          <span className="ov-assignee-none">Unassigned</span>
        )}
      </div>
    </div>
  );
}

/** How many rows a card shows before collapsing the rest behind "view all". */
const ATTENTION_PREVIEW = 5;

function AttentionCard({
  title,
  blurb,
  icon,
  items,
  emptyText,
  viewAllHref,
  showAmount = false,
}: {
  title: string;
  blurb: string;
  icon: React.ReactNode;
  items: AttentionItem[];
  emptyText: string;
  viewAllHref: string;
  showAmount?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, ATTENTION_PREVIEW);
  const hidden = items.length - visible.length;
  const worst = items.some((item) => item.severity === "danger");

  return (
    <div className={`ov-attn-card${items.length === 0 ? " resolved" : ""}`}>
      <div className="ov-attn-head">
        <span className={`ov-attn-icon${worst ? " danger" : ""}`}>{icon}</span>
        <div className="ov-attn-headings">
          <h3 className="ov-attn-title">{title}</h3>
          <p className="ov-attn-blurb">{blurb}</p>
        </div>
        <span className={`ov-attn-count${worst ? " danger" : ""}`}>{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="ov-attn-empty">{emptyText}</p>
      ) : (
        <>
          <ul className="ov-attn-list">
            {visible.map((item) => (
              <li key={item.key} className={`ov-attn-item severity-${item.severity}`}>
                <Link href={`/dashboard/jobs/${item.jobId}`} className="ov-attn-link">
                  <span className="ov-attn-customer">{item.customerName}</span>
                  <span className="ov-attn-detail">{item.detail}</span>
                  <span className="ov-attn-tail">
                    {showAmount && item.amount ? (
                      <span className="ov-attn-amount">{formatCurrency(item.amount)}</span>
                    ) : (
                      <span className="ov-attn-stage">{getStageDisplay(item.stage)}</span>
                    )}
                    {item.assignee && <span className="ov-attn-staff">{item.assignee}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="ov-attn-foot">
            {hidden > 0 && (
              <button type="button" className="ov-attn-more" onClick={() => setExpanded(true)}>
                Show {hidden} more
              </button>
            )}
            {expanded && items.length > ATTENTION_PREVIEW && (
              <button type="button" className="ov-attn-more" onClick={() => setExpanded(false)}>
                Show less
              </button>
            )}
            <Link href={viewAllHref} className="ov-attn-viewall">
              Open in Jobs →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

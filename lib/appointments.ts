/**
 * lib/appointments.ts
 *
 * A job is not one appointment. It carries up to three independently
 * scheduled slots — the site visit, the job itself, and an optional second
 * visit — each with its own date, time, and Google Calendar event
 * (see the `schedule` array in lib/syncProcessor.ts). Anything that shows
 * "what is happening on a given day" has to expand jobs into slots first,
 * or a job with all three dates set silently shows up once instead of
 * three times.
 *
 * This module owns that expansion, plus the date arithmetic that goes with
 * it. Slot names deliberately match SLOT_EVENT_COLUMN in syncProcessor.ts —
 * one vocabulary for calendar sync and calendar display.
 */

// ── Slot types ────────────────────────────────────────────────────────────────

export type AppointmentType = "site_visit" | "job" | "second_visit";

/** Canonical order — site visit precedes the job precedes the second visit. */
export const APPOINTMENT_TYPES: readonly AppointmentType[] = [
  "site_visit",
  "job",
  "second_visit",
] as const;

/**
 * Display metadata per slot type. `tone` maps to the CSS colour families in
 * globals.css (--accent / --success / --warning), so badges, calendar chips
 * and legend dots all colour a slot the same way without duplicating hexes.
 */
export const APPOINTMENT_META: Record<
  AppointmentType,
  { label: string; short: string; tone: "accent" | "success" | "warning" }
> = {
  site_visit: { label: "Site Visit", short: "SV", tone: "accent" },
  job: { label: "Job", short: "Job", tone: "success" },
  second_visit: { label: "2nd Visit", short: "2nd", tone: "warning" },
};

/** The jobs columns holding each slot's date, time and Google event id. */
export const APPOINTMENT_COLUMNS: Record<
  AppointmentType,
  { date: string; time: string; eventId: string }
> = {
  site_visit: { date: "visit_date", time: "visit_time", eventId: "visit_event_id" },
  job: { date: "job_date", time: "job_time", eventId: "job_event_id" },
  second_visit: {
    date: "second_visit_date",
    time: "second_visit_time",
    eventId: "second_visit_event_id",
  },
};

// ── Query projection ──────────────────────────────────────────────────────────

/**
 * Projected columns for any appointment-driven view. Follows the JOB_SELECT
 * convention in app/dashboard/jobs/page.tsx — never select('*') on this table.
 */
export const JOB_APPOINTMENT_SELECT = [
  "id",
  "stage",
  "status",
  "service_type",
  "unit_count",
  "engineer_name",
  "assigned_to",
  "priority",
  "visit_date",
  "visit_time",
  "visit_phone",
  "job_date",
  "job_time",
  "second_visit_date",
  "second_visit_time",
  "customers(name,phone,address)",
].join(",");

/**
 * Extra columns the attention lists need on top of the appointment ones —
 * money owed, quotation ageing, and loss/closure state.
 */
export const JOB_ATTENTION_SELECT = [
  JOB_APPOINTMENT_SELECT,
  "quoted_amount",
  "deposit_amount",
  "deposit_collected",
  "final_payment_collected",
  "payment_status",
  "quoted_date",
  "expiry_date",
  "closed_at",
  "created_at",
].join(",");

// ── Shapes ────────────────────────────────────────────────────────────────────

/** The subset of a job row this module reads. */
export interface AppointmentJob {
  id: string;
  stage: string;
  status?: string | null;
  service_type?: string | null;
  unit_count?: number | null;
  engineer_name?: string | null;
  assigned_to?: string | null;
  priority?: string | null;
  visit_date?: string | null;
  visit_time?: string | null;
  visit_phone?: string | null;
  job_date?: string | null;
  job_time?: string | null;
  second_visit_date?: string | null;
  second_visit_time?: string | null;
  customers?:
    | { name?: string | null; phone?: string | null; address?: string | null }
    | { name?: string | null; phone?: string | null; address?: string | null }[]
    | null;
}

export interface Appointment {
  /** Stable key — a job contributes at most one appointment per slot type. */
  id: string;
  jobId: string;
  type: AppointmentType;
  /** YYYY-MM-DD. */
  date: string;
  /** HH:MM in 24h, or null when nobody set a time. */
  time: string | null;
  stage: string;
  serviceType: string | null;
  unitCount: number | null;
  /** Who is going. Null means nobody is — see resolveAssignee(). */
  assignee: string | null;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
}

/**
 * Who is actually doing this job.
 *
 * The `assigned_to` FK to profiles reads like the obvious answer and is the
 * wrong one: it is null on every job in the database. What the team fills in
 * is `engineer_name`, a free-text field on the quotation form. The profile
 * link is kept as a fallback so that assignments made through it — none yet —
 * would still resolve. Same precedence as InvoicePreviewModal, minus its
 * hardcoded default, because a dashboard guessing at an assignee is worse
 * than one admitting there isn't one.
 *
 * Names are trimmed: the data contains both "Jason" and "Jason ".
 */
export function resolveAssignee(
  job: Pick<AppointmentJob, "engineer_name" | "assigned_to">,
  staffNames?: Map<string, string>
): string | null {
  const engineer = job.engineer_name?.trim();
  if (engineer) return engineer;
  if (job.assigned_to) return staffNames?.get(job.assigned_to) ?? "Assigned staff";
  return null;
}

// ── Expansion ─────────────────────────────────────────────────────────────────

/** Supabase returns an embedded one-to-one as either an object or a 1-element array. */
function firstCustomer(customers: AppointmentJob["customers"]) {
  return Array.isArray(customers) ? customers[0] : customers;
}

/** Empty strings are possible in these text columns; treat them as unset. */
function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanDate(value: string | null | undefined): string | null {
  return trimOrNull(value)?.slice(0, 10) ?? null;
}

/**
 * Expands one job into one appointment per scheduled slot. Mirrors the
 * `schedule` array in lib/syncProcessor.ts — if a slot is added there, add it
 * here too or it will sync to Google but never appear in the app.
 */
export function expandJobToAppointments(
  job: AppointmentJob,
  staffNames?: Map<string, string>
): Appointment[] {
  const customer = firstCustomer(job.customers);
  const base = {
    jobId: job.id,
    stage: job.stage,
    serviceType: job.service_type ?? null,
    unitCount: job.unit_count ?? null,
    assignee: resolveAssignee(job, staffNames),
    customerName: customer?.name?.trim() || "Unknown customer",
    // visit_phone is the on-site contact for this specific visit, which is
    // not always the customer's own number.
    customerPhone: trimOrNull(job.visit_phone) || customer?.phone || null,
    customerAddress: customer?.address || null,
  };

  const slots: { type: AppointmentType; date: string | null; time: string | null }[] = [
    { type: "site_visit", date: cleanDate(job.visit_date), time: trimOrNull(job.visit_time) },
    { type: "job", date: cleanDate(job.job_date), time: trimOrNull(job.job_time) },
    {
      type: "second_visit",
      date: cleanDate(job.second_visit_date),
      time: trimOrNull(job.second_visit_time),
    },
  ];

  const appointments: Appointment[] = [];
  for (const slot of slots) {
    if (!slot.date) continue;
    appointments.push({
      ...base,
      id: `${job.id}:${slot.type}`,
      type: slot.type,
      date: slot.date,
      time: slot.time,
    });
  }
  return appointments;
}

export function expandJobsToAppointments(
  jobs: AppointmentJob[],
  staffNames?: Map<string, string>
): Appointment[] {
  return jobs.flatMap((job) => expandJobToAppointments(job, staffNames));
}

/**
 * Chronological order within a day. Untimed appointments sort last: they are
 * unscheduled work, not midnight work, and burying them at 00:00 would put
 * them above the 8am jobs that actually start the day.
 */
export function compareAppointments(a: Appointment, b: Appointment): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.time && b.time) return a.time.localeCompare(b.time);
  if (a.time) return -1;
  if (b.time) return 1;
  return a.customerName.localeCompare(b.customerName);
}

export function sortAppointments(appointments: Appointment[]): Appointment[] {
  return [...appointments].sort(compareAppointments);
}

/** Buckets appointments by their YYYY-MM-DD date, each bucket time-sorted. */
export function groupByDate(appointments: Appointment[]): Map<string, Appointment[]> {
  const byDate = new Map<string, Appointment[]>();
  for (const appointment of appointments) {
    const bucket = byDate.get(appointment.date);
    if (bucket) bucket.push(appointment);
    else byDate.set(appointment.date, [appointment]);
  }
  for (const bucket of byDate.values()) bucket.sort(compareAppointments);
  return byDate;
}

// ── Dates ─────────────────────────────────────────────────────────────────────

/**
 * The timezone the business actually operates in. Matches the fallback used
 * by lib/googleCalendar.ts so the app and the calendar never disagree about
 * which day a slot belongs to.
 */
export const BUSINESS_TZ = process.env.GOOGLE_CALENDAR_TIME_ZONE || "Asia/Singapore";

/**
 * Today's date in the business timezone, as YYYY-MM-DD.
 *
 * Deliberately not `new Date().toISOString().slice(0, 10)`: servers run in
 * UTC and Singapore is UTC+8, so that expression returns *yesterday* for the
 * last eight hours of every working day — the dashboard would quietly show
 * the wrong run sheet every evening.
 */
export function todayInBusinessTz(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Parses YYYY-MM-DD at UTC midnight, so arithmetic never crosses a DST seam. */
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toISODate(date);
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function diffDays(from: string, to: string): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000);
}

/** Monday-based week start, matching how the team reads a working week. */
export function startOfWeek(iso: string): string {
  const date = parseISODate(iso);
  const weekday = date.getUTCDay(); // 0 = Sunday
  return addDays(iso, weekday === 0 ? -6 : 1 - weekday);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const date = parseISODate(iso);
  return toISODate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

export function addMonths(iso: string, months: number): string {
  const date = parseISODate(iso);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  // Clamp to the last valid day, so 31 Jan + 1 month lands on 28/29 Feb.
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return toISODate(target);
}

/** Inclusive list of dates from `from` to `to`. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** True when `iso` falls on a Saturday or Sunday. */
export function isWeekend(iso: string): boolean {
  const weekday = parseISODate(iso).getUTCDay();
  return weekday === 0 || weekday === 6;
}

// ── Calendar ranges ───────────────────────────────────────────────────────────

export type CalendarView = "month" | "week" | "day";

export const CALENDAR_VIEWS: readonly CalendarView[] = ["month", "week", "day"] as const;

/**
 * The date window a view has to load. Month deliberately reaches past the
 * month itself to cover the grid's leading and trailing days — without that,
 * the cells spilling in from the neighbouring months render mysteriously
 * empty even when work is booked on them.
 */
export function rangeForView(view: CalendarView, anchor: string): { from: string; to: string } {
  if (view === "day") return { from: anchor, to: anchor };
  if (view === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  const from = startOfWeek(startOfMonth(anchor));
  return { from, to: addDays(startOfWeek(endOfMonth(anchor)), 6) };
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** "14:30" → "2:30 PM". Returns null for untimed slots so callers can branch. */
export function formatTime(time: string | null): string | null {
  if (!time) return null;
  const [hourText, minuteText = "00"] = time.split(":");
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) return time;
  const suffix = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minuteText.padStart(2, "0")} ${suffix}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function weekdayShort(iso: string): string {
  return DAY_NAMES[parseISODate(iso).getUTCDay()];
}

export function dayOfMonth(iso: string): number {
  return parseISODate(iso).getUTCDate();
}

/** "Fri 1 Aug" — compact enough for a day strip. */
export function formatDayShort(iso: string): string {
  const date = parseISODate(iso);
  return `${DAY_NAMES[date.getUTCDay()]} ${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]}`;
}

/** "Friday, 1 August 2026" — for a page heading. */
export function formatDayLong(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseISODate(iso));
}

/** "August 2026". */
export function formatMonthLong(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(parseISODate(iso));
}

/** "Today" / "Tomorrow" / "Yesterday", else a short date. */
export function formatRelativeDay(iso: string, today: string): string {
  const delta = diffDays(today, iso);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  return formatDayShort(iso);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(amount);
}

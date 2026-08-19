/**
 * lib/availability.ts
 *
 * "Is this slot free?" — the question nothing in this app could answer until
 * the AI assistant needed to offer a customer a site visit without a human in
 * the loop.
 *
 * Pure functions only, in the style of lib/appointments.ts: every input is
 * passed in, nothing is fetched, nothing reads the clock except businessNow()
 * (which takes the Date to read). Data loading lives in
 * app/services/availabilityService.ts, and the booking write re-checks the
 * same rules inside a Postgres advisory lock (the book_site_visit RPC in
 * migration 20260819000000_booking_api.sql). The capacities and window bounds
 * that RPC checks against are passed to it from the constants below, so the
 * two can never drift apart.
 *
 * ── Why fixed slots ──────────────────────────────────────────────────────────
 * jobs.visit_time is `text` and there is no duration column anywhere, so
 * "does 14:30 overlap 13:00–14:00" is not a question this schema can answer.
 * Instead the working day is cut into hourly windows, 10:00 to 19:00, matching
 * the 10am–8pm the knowledge base promises customers. A slot id is the literal
 * string written to jobs.visit_time, and counting is a floor-to-the-hour, so
 * every appointment a human booked by hand at 11:00 (38 of them), 14:30 or
 * 15:15 consumes capacity exactly like an API booking does.
 *
 * ── What counts ──────────────────────────────────────────────────────────────
 * Occupancy is not just site visits, and not just this app's own jobs. All
 * three appointment types count — an engineer on an installation is not free
 * for a survey — and so do entries made directly in Google Calendar, which
 * this team uses constantly (see lib/calendarBlocks.ts).
 */

import type { Appointment, AppointmentJob } from "@/lib/appointments";
import {
  BUSINESS_TZ,
  addDays,
  eachDay,
  expandJobsToAppointments,
  parseISODate,
} from "@/lib/appointments";

// ── Slot vocabulary ───────────────────────────────────────────────────────────

export interface SiteVisitSlot {
  /** Written verbatim to jobs.visit_time. 24h HH:MM. */
  id: string;
  /** What the assistant says to the customer. */
  label: string;
  /** Inclusive start of the window this slot owns, 24h HH:MM. */
  windowStart: string;
  /** Exclusive end of that window. */
  windowEnd: string;
  /** How many appointments may sit in this window on one day. */
  capacity: number;
}

/** First offerable start time. The customer-facing knowledge base says 10am. */
export const SLOT_START_HOUR = 10;
/** Close of business. The last slot therefore starts at 19:00 and ends at 8pm. */
export const SLOT_END_HOUR = 20;

/**
 * Appointments allowed in any one hour.
 *
 * Two, from the history: the most site visits ever booked into a single hour
 * is 2 (four times in 73 days). One would be far too tight now that jobs count
 * towards slots as well — 109 installations start at exactly 10:00, so a
 * capacity of 1 would close the 10am survey slot on virtually every working
 * day of the year.
 */
export const SLOT_CAPACITY = 2;

/** "13:00" → "1pm", "12:00" → "12pm", "20:00" → "8pm". */
function hourLabel(hour: number): string {
  const suffix = hour < 12 || hour === 24 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${suffix}`;
}

/**
 * One slot per hour from SLOT_START_HOUR to SLOT_END_HOUR.
 *
 * Windows are the hour itself, so bucketing is a floor-to-the-hour: the 38
 * bookings at 11:00 land on the 11:00 slot, and 14:30 / 15:15 / 19:30 floor
 * into 14:00 / 15:00 / 19:00. Anything outside the grid — the legacy 09:00,
 * 09:30 and 00:00 rows, 17 in total — belongs to no slot and is counted
 * against the day only, which is right: it is real work nobody can be sold
 * over, but it is not a time this API will ever offer.
 */
function buildHourlySlots(): SiteVisitSlot[] {
  const slots: SiteVisitSlot[] = [];
  for (let hour = SLOT_START_HOUR; hour < SLOT_END_HOUR; hour++) {
    slots.push({
      id: `${String(hour).padStart(2, "0")}:00`,
      label: `${hourLabel(hour)}–${hourLabel(hour + 1)}`,
      windowStart: `${String(hour).padStart(2, "0")}:00`,
      windowEnd: `${String(hour + 1).padStart(2, "0")}:00`,
      capacity: SLOT_CAPACITY,
    });
  }
  return slots;
}

/** The offerable slots, in order: 10:00 … 19:00. */
export const SITE_VISIT_SLOTS: readonly SiteVisitSlot[] = buildHourlySlots();

/**
 * Days the team does site visits. 0 = Sunday, matching Date.getUTCDay().
 * Not one site visit in the table's history falls on a Sunday; installations
 * do, which is why Sunday still consumes day capacity but is never offered.
 */
export const WORKING_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6];

/**
 * Ceiling on *all* work in one day — every appointment type, plus manual
 * Google Calendar entries — on top of the per-slot ceiling. This is what stops
 * the assistant selling a survey into a day the team has already filled: an
 * engineer on an installation is not free for a survey, even though that
 * installation only sits in one hour.
 *
 * Eight, from the busiest day this team has actually worked. Over the last 90
 * days: 77 worked days, mean 4.1, p90 7, and six days at 8 (jobs + manual
 * calendar entries combined). Nothing in the history goes past 8, so 8 is the
 * observed ceiling rather than a guess — and because it counts manual Calendar
 * entries too, it measures the real load, not just the part of it that went
 * through this app.
 */
export const DAILY_APPOINTMENT_CAPACITY = 8;

/**
 * How far ahead a booking must be made.
 *
 * Three hours, not a day. The business reschedules and cancels on 2–3 hours'
 * notice as a matter of policy, so it plainly handles short notice — and a 24h
 * floor means a lead who messages at 9am cannot be seen until tomorrow, which
 * is a conversion cost paid every single morning. Three hours still leaves
 * time to route an engineer.
 */
export const MIN_LEAD_HOURS = 3;

/** How far ahead availability is ever offered. */
export const AVAILABILITY_HORIZON_DAYS = 14;

export type SlotId = string;

export function slotById(id: string): SiteVisitSlot | undefined {
  return SITE_VISIT_SLOTS.find((slot) => slot.id === id);
}

// ── Time helpers ──────────────────────────────────────────────────────────────

/** "9:00" | "09:00:00" | " 9:5 " → "09:00" / "09:05". Null when unparseable. */
export function normalizeTime(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{1,2}):(\d{1,2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Minutes since midnight. Assumes an already-normalized HH:MM. */
export function minutesOfDay(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/**
 * The slot whose window contains this time, or null for untimed appointments
 * and for times outside the working day.
 */
export function slotForTime(time: string | null | undefined): SiteVisitSlot | null {
  const normalized = normalizeTime(time);
  if (!normalized) return null;
  const minutes = minutesOfDay(normalized);
  return (
    SITE_VISIT_SLOTS.find(
      (slot) =>
        minutes >= minutesOfDay(slot.windowStart) && minutes < minutesOfDay(slot.windowEnd)
    ) ?? null
  );
}

/**
 * A wall-clock instant in the business timezone, as minutes since the epoch.
 * Singapore has no DST, so treating the local wall clock as a flat number
 * line is exact — and it keeps lead-time arithmetic away from UTC entirely.
 */
export function wallClockMinutes(date: string, time: string): number {
  return parseISODate(date).getTime() / 60_000 + minutesOfDay(time);
}

/** Splits a wall-clock minute count back into its date and time. */
export function fromWallClockMinutes(minutes: number): { date: string; time: string } {
  const dayStart = Math.floor(minutes / 1440) * 1440;
  const date = new Date(dayStart * 60_000).toISOString().slice(0, 10);
  const withinDay = minutes - dayStart;
  const hour = String(Math.floor(withinDay / 60)).padStart(2, "0");
  const minute = String(withinDay % 60).padStart(2, "0");
  return { date, time: `${hour}:${minute}` };
}

/**
 * Now, in the business timezone. Same reasoning as todayInBusinessTz() in
 * lib/appointments.ts — servers run in UTC and Singapore is UTC+8, so
 * anything derived from toISOString() is eight hours wrong every evening.
 * The Date is a parameter so tests can pin it.
 */
export function businessNow(now: Date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  // Some ICU versions report midnight as hour "24" — as lib/googleCalendar.ts
  // also has to allow for.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${hour}:${get("minute")}`,
  };
}

// ── Capacity inputs ───────────────────────────────────────────────────────────

/**
 * A slot whose Google Calendar event a person deleted by hand. Shape matches
 * the columns of calendar_slot_removals that matter here.
 */
export interface SlotRemovalRef {
  job_id: string;
  event_type: string;
  slot_date: string | null;
}

/** The loss/closure columns that decide whether a job is still real work. */
export interface JobOutcomeFields {
  status?: string | null;
  loss_reason?: string | null;
  closed_at?: string | null;
}

export type CapacityJob = AppointmentJob & JobOutcomeFields;

/**
 * Does this job still occupy anyone's day?
 *
 * A cancelled or lost job keeps its dates — nothing in this schema clears
 * them — so counting rows by date alone would let a job the team walked away
 * from block a slot forever. `status` is 'open' on every row in production
 * today; `loss_reason` is what the app actually writes when a job is lost
 * (see AnalyticsClient, which derives "lost" from it) and `closed_at` when it
 * is closed, so all three are checked.
 */
export function isCapacityConsuming(job: CapacityJob): boolean {
  if (job.status && job.status !== "open") return false;
  if (job.loss_reason && job.loss_reason.trim() !== "") return false;
  if (job.closed_at) return false;
  return true;
}

function removalKey(jobId: string, type: string): string {
  return `${jobId}:${type}`;
}

/**
 * Deleting the event in Google Calendar is how this team says "this isn't
 * happening" — migration 20260728120000 takes that at face value and leaves
 * the slot off the calendar for good. So the slot does not consume capacity
 * either: nobody is going, and refusing to re-sell that time would quietly
 * strand it.
 *
 * A removal only speaks for the date it was recorded against, matching
 * removalApplies() in lib/syncProcessor.ts. Rescheduling the slot in the app
 * is a fresh statement that it *should* be on the calendar, and it starts
 * consuming capacity again.
 */
export function isRemoved(
  appointment: Pick<Appointment, "jobId" | "type" | "date">,
  removals: ReadonlyMap<string, SlotRemovalRef>
): boolean {
  const removal = removals.get(removalKey(appointment.jobId, appointment.type));
  return Boolean(removal && removal.slot_date === appointment.date);
}

export function removalIndex(
  removals: readonly SlotRemovalRef[]
): Map<string, SlotRemovalRef> {
  return new Map(removals.map((r) => [removalKey(r.job_id, r.event_type), r]));
}

/**
 * Every appointment that really occupies the team, from raw job rows.
 *
 * All three appointment types are expanded, not just the site visit: an
 * engineer on an installation is not free for a survey, and counting
 * visit_date alone is exactly how a day gets sold twice.
 */
export function capacityAppointments(
  jobs: readonly CapacityJob[],
  removals: readonly SlotRemovalRef[] = []
): Appointment[] {
  const index = removalIndex(removals);
  return expandJobsToAppointments(jobs.filter(isCapacityConsuming)).filter(
    (appointment) => !isRemoved(appointment, index)
  );
}

// ── Manual Google Calendar entries ────────────────────────────────────────────

/**
 * Something on the Google Calendar that this app did not put there: a job
 * typed straight into Calendar, a reserved morning, a leave day.
 *
 * These matter more than they sound. Of the events on the calendar over a
 * 135-day window, 39 were not created by this app — "Reserve 3 men first trip
 * piping", "Jackie save for urgent", "Book Randy. Sys 2 second hand." —
 * i.e. real work that jobs rows know nothing about. Availability computed from
 * the jobs table alone would sell straight over them.
 *
 * Loaded by lib/calendarBlocks.ts, which is also where events this app *did*
 * create get filtered out (by event id) so they aren't counted twice.
 */
export interface CalendarBlock {
  /** Google's event id — only used to keep blocks distinct. */
  id: string;
  /** YYYY-MM-DD in the business timezone. */
  date: string;
  /** HH:MM in the business timezone, or null for an all-day/untimed entry. */
  time: string | null;
  /**
   * True when this entry closes the whole day rather than occupying an hour.
   * See DAY_CLOSING_TAG — it is never inferred from the event being all-day.
   */
  wholeDay: boolean;
  summary: string | null;
}

/**
 * What has to appear in an event's title for it to close the whole day.
 *
 * Deliberately a bracketed tag, and deliberately not "the event is all-day".
 * Every all-day event this team has ever created is a job with no fixed time —
 * "Servicing anytime before 8pm", "Check wire", "Silicon all holes", "Shift ac
 * center", "Checking. Not cold." Treating all-day as a closure would have shut
 * five otherwise workable days in the last three months.
 *
 * A bracket tag also can't collide with the addresses that fill these titles:
 * a bare word convention would have to match "leave" and "block", and every
 * second title contains "Block 231 Yishun Ring Road". It reads like the app's
 * own "[Job · Resale]" titles, which the team already sees every day.
 */
export const DAY_CLOSING_TAG = /\[\s*(leave|closed|off|ph|public holiday|holiday|block(?:ed)?)\s*\]/i;

export function closesWholeDay(summary: string | null | undefined): boolean {
  return DAY_CLOSING_TAG.test(summary ?? "");
}

// ── Occupancy ─────────────────────────────────────────────────────────────────

export interface DayOccupancy {
  /** Appointments falling in each slot's window, keyed by slot id. */
  bySlot: Map<SlotId, number>;
  /** Every appointment that day, including untimed and out-of-hours ones. */
  total: number;
  /** Slots where at least one of the occupants came from Google Calendar. */
  blockedSlots: Set<SlotId>;
  /** Set when something closes the entire day; the value is the reason shown. */
  closedBy?: string;
}

function ensureDay(byDate: Map<string, DayOccupancy>, date: string): DayOccupancy {
  let day = byDate.get(date);
  if (!day) {
    day = { bySlot: new Map(), total: 0, blockedSlots: new Set() };
    byDate.set(date, day);
  }
  return day;
}

/**
 * How full each day is, counting jobs and manual calendar entries alike.
 *
 * A manual entry consumes exactly what an appointment consumes — one unit of
 * its hour and one of the day — because that is what it is: someone's time.
 * The exception is a tagged closure, which takes the day out entirely.
 */
export function occupancyByDate(
  appointments: readonly Appointment[],
  blocks: readonly CalendarBlock[] = []
): Map<string, DayOccupancy> {
  const byDate = new Map<string, DayOccupancy>();

  for (const appointment of appointments) {
    const day = ensureDay(byDate, appointment.date);
    day.total += 1;
    const slot = slotForTime(appointment.time);
    if (slot) day.bySlot.set(slot.id, (day.bySlot.get(slot.id) ?? 0) + 1);
  }

  for (const block of blocks) {
    const day = ensureDay(byDate, block.date);
    if (block.wholeDay) {
      day.closedBy = block.summary?.trim() || "Blocked in Google Calendar";
      continue;
    }
    day.total += 1;
    const slot = slotForTime(block.time);
    if (slot) {
      day.bySlot.set(slot.id, (day.bySlot.get(slot.id) ?? 0) + 1);
      day.blockedSlots.add(slot.id);
    }
  }

  return byDate;
}

// ── Availability ──────────────────────────────────────────────────────────────

/** Why a slot is not on offer. Sent to the assistant as-is, for its logs. */
export type UnavailableReason =
  | "non_working_day"
  | "blackout"
  | "calendar_block"
  | "past_lead_time"
  | "beyond_horizon"
  | "slot_full"
  | "day_full";

export interface SlotAvailability {
  slot: SlotId;
  label: string;
  available: boolean;
  /** Bookings still accepted in this slot. 0 whenever available is false. */
  remaining: number;
  reason?: UnavailableReason;
}

export interface DayAvailability {
  date: string;
  /** 0 = Sunday, matching Date.getUTCDay(). */
  weekday: number;
  workingDay: boolean;
  /** Set when the date is a public holiday or another blackout. */
  blackoutReason?: string;
  /** Set when a tagged Google Calendar entry closes the day; the event title. */
  calendarBlockReason?: string;
  /**
   * Bookings the day can still take before the daily ceiling stops it,
   * whatever the individual slots say. Zero means every slot reads day_full.
   */
  remainingToday: number;
  slots: SlotAvailability[];
}

export interface BlackoutDate {
  date: string;
  reason?: string | null;
}

export interface AvailabilityInput {
  from: string;
  to: string;
  jobs: readonly CapacityJob[];
  removals?: readonly SlotRemovalRef[];
  blackouts?: readonly BlackoutDate[];
  /** Manual Google Calendar entries; see lib/calendarBlocks.ts. */
  blocks?: readonly CalendarBlock[];
  /** Business-timezone now; see businessNow(). */
  now: { date: string; time: string };
  /** Overridable so a test — or a future rush-job rule — can relax the lead. */
  leadHours?: number;
  horizonDays?: number;
}

export function blackoutIndex(
  blackouts: readonly BlackoutDate[]
): Map<string, string | null> {
  return new Map(blackouts.map((b) => [b.date, b.reason ?? null]));
}

export function isWorkingDay(date: string): boolean {
  return WORKING_WEEKDAYS.includes(parseISODate(date).getUTCDay());
}

/**
 * The earliest wall-clock instant a booking may start. Everything before it
 * is either in the past or inside the lead-time window.
 */
export function earliestBookable(
  now: { date: string; time: string },
  leadHours: number = MIN_LEAD_HOURS
): { date: string; time: string } {
  return fromWallClockMinutes(wallClockMinutes(now.date, now.time) + leadHours * 60);
}

/**
 * The whole answer: one entry per day in [from, to], each listing every slot
 * with whether it can be booked and, when it can't, why.
 *
 * Unavailable slots are returned rather than filtered out on purpose — the
 * assistant re-offering a slot it was told was full is a bug worth being able
 * to see in a log, and "day_full" vs "slot_full" is the difference between
 * offering another time and offering another day.
 */
export function computeAvailability(input: AvailabilityInput): DayAvailability[] {
  const {
    from,
    to,
    jobs,
    removals = [],
    blackouts = [],
    blocks = [],
    now,
    leadHours = MIN_LEAD_HOURS,
    horizonDays = AVAILABILITY_HORIZON_DAYS,
  } = input;

  const occupancy = occupancyByDate(capacityAppointments(jobs, removals), blocks);
  const blackoutsByDate = blackoutIndex(blackouts);
  const earliestMinutes = (() => {
    const earliest = earliestBookable(now, leadHours);
    return wallClockMinutes(earliest.date, earliest.time);
  })();
  const horizonEnd = addDays(now.date, horizonDays);

  return eachDay(from, to).map((date) => {
    const weekday = parseISODate(date).getUTCDay();
    const workingDay = isWorkingDay(date);
    const blackoutReason = blackoutsByDate.has(date)
      ? blackoutsByDate.get(date) ?? "Closed"
      : undefined;
    const day = occupancy.get(date);
    const dayTotal = day?.total ?? 0;

    const slots = SITE_VISIT_SLOTS.map((slot): SlotAvailability => {
      const used = day?.bySlot.get(slot.id) ?? 0;
      const remaining = Math.max(slot.capacity - used, 0);

      // Ordered from the most fundamental reason to the most incidental, so a
      // Sunday that is also full reads as "we don't work Sundays". A full slot
      // that a manual Calendar entry helped fill reports calendar_block
      // instead of slot_full — otherwise the office looks for a job that
      // isn't there.
      const reason: UnavailableReason | undefined = !workingDay
        ? "non_working_day"
        : blackoutReason !== undefined
          ? "blackout"
          : day?.closedBy !== undefined
            ? "calendar_block"
            : wallClockMinutes(date, slot.id) < earliestMinutes
              ? "past_lead_time"
              : date > horizonEnd
                ? "beyond_horizon"
                : remaining <= 0
                  ? day?.blockedSlots.has(slot.id)
                    ? "calendar_block"
                    : "slot_full"
                  : dayTotal >= DAILY_APPOINTMENT_CAPACITY
                    ? "day_full"
                    : undefined;

      return {
        slot: slot.id,
        label: slot.label,
        available: reason === undefined,
        remaining: reason === undefined ? remaining : 0,
        ...(reason ? { reason } : {}),
      };
    });

    return {
      date,
      weekday,
      workingDay,
      remainingToday: Math.max(DAILY_APPOINTMENT_CAPACITY - dayTotal, 0),
      ...(blackoutReason !== undefined ? { blackoutReason } : {}),
      ...(day?.closedBy !== undefined ? { calendarBlockReason: day.closedBy } : {}),
      slots,
    };
  });
}

/**
 * The window availability is computed over when the caller doesn't name one:
 * from the lead-time boundary through the horizon.
 */
export function defaultAvailabilityRange(
  now: { date: string; time: string },
  leadHours: number = MIN_LEAD_HOURS,
  horizonDays: number = AVAILABILITY_HORIZON_DAYS
): { from: string; to: string } {
  return {
    from: earliestBookable(now, leadHours).date,
    to: addDays(now.date, horizonDays),
  };
}

/** Flattens to just the bookable (date, slot) pairs, in chronological order. */
export function bookableSlots(
  days: readonly DayAvailability[]
): { date: string; slot: SlotId; label: string }[] {
  return days.flatMap((day) =>
    day.slots
      .filter((slot) => slot.available)
      .map((slot) => ({ date: day.date, slot: slot.slot, label: slot.label }))
  );
}

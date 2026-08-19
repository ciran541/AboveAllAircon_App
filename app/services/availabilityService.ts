/**
 * app/services/availabilityService.ts
 *
 * The thin data-loading layer under lib/availability.ts. Everything that
 * decides anything lives in that module, pure and unit-tested; this file only
 * fetches what it needs — jobs, hand-deleted slots, blackout dates, and the
 * Google Calendar itself — and hands it over.
 *
 * Reads go through the admin client. There is no cookie session on an API
 * request from the assistant, and the shared secret on the route is the gate —
 * the same reasoning as app/api/cron/process-sync-queue.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  AVAILABILITY_HORIZON_DAYS,
  DAILY_APPOINTMENT_CAPACITY,
  MIN_LEAD_HOURS,
  SITE_VISIT_SLOTS,
  businessNow,
  computeAvailability,
  defaultAvailabilityRange,
  type BlackoutDate,
  type CapacityJob,
  type DayAvailability,
  type SlotRemovalRef,
} from "@/lib/availability";
import { BUSINESS_TZ, addDays } from "@/lib/appointments";
import { loadCalendarBlocks } from "@/lib/calendarBlocks";

/**
 * Narrower than JOB_APPOINTMENT_SELECT in lib/appointments.ts: availability
 * needs the dates and the loss/closure state, and nothing about the customer.
 * Two weeks of jobs is a small read, and it stays small.
 */
export const AVAILABILITY_JOB_SELECT = [
  "id",
  "stage",
  "status",
  "loss_reason",
  "closed_at",
  "visit_date",
  "visit_time",
  "job_date",
  "job_time",
  "second_visit_date",
  "second_visit_time",
  // Not for the arithmetic — for subtracting this app's own events from the
  // Google Calendar read, so a booking isn't counted once from jobs and again
  // from the calendar it was synced to.
  "visit_event_id",
  "job_event_id",
  "second_visit_event_id",
].join(",");

/** Never look further ahead than this, whatever the caller asks for. */
const MAX_RANGE_DAYS = 60;

export interface AvailabilityResult {
  from: string;
  to: string;
  days: DayAvailability[];
  now: { date: string; time: string };
  /**
   * True when Google Calendar could not be read, so these numbers account for
   * jobs only and anything entered directly in Calendar is invisible. The
   * response still goes out — refusing every booking during a Google outage is
   * worse than a rare double-book — and an alert has been fired.
   */
  calendarDegraded: boolean;
  /** True when the calendar side came from an expired cache. */
  calendarStale: boolean;
}

/**
 * Availability for [from, to], defaulting to the whole offerable window.
 *
 * The range is clamped rather than rejected: an assistant asking for three
 * months of availability should get the fortnight it is allowed to sell, not
 * an error it has to learn to handle.
 */
export async function loadAvailability(
  from?: string | null,
  to?: string | null,
  now = businessNow()
): Promise<AvailabilityResult> {
  const fallback = defaultAvailabilityRange(now);
  const rangeFrom = from ?? fallback.from;
  const requestedTo = to ?? fallback.to;
  // Clamp the far end twice: to the horizon the business offers, and to a hard
  // ceiling so a silly `to` can't turn into a table scan.
  const horizonEnd = addDays(now.date, AVAILABILITY_HORIZON_DAYS);
  const hardCeiling = addDays(rangeFrom, MAX_RANGE_DAYS);
  const rangeTo = [requestedTo, horizonEnd, hardCeiling].sort()[0];

  if (rangeTo < rangeFrom) {
    return {
      from: rangeFrom,
      to: rangeFrom,
      days: [],
      now,
      calendarDegraded: false,
      calendarStale: false,
    };
  }

  const admin = createAdminClient();

  const [jobsResult, removalsResult, blackoutsResult] = await Promise.all([
    admin
      .from("jobs")
      .select(AVAILABILITY_JOB_SELECT)
      // Any of the three slots landing in the window makes the job relevant —
      // an installation occupies the day just as much as a site visit does.
      .or(
        `and(visit_date.gte.${rangeFrom},visit_date.lte.${rangeTo}),` +
          `and(job_date.gte.${rangeFrom},job_date.lte.${rangeTo}),` +
          `and(second_visit_date.gte.${rangeFrom},second_visit_date.lte.${rangeTo})`
      ),
    admin
      .from("calendar_slot_removals")
      .select("job_id, event_type, slot_date")
      .gte("slot_date", rangeFrom)
      .lte("slot_date", rangeTo),
    admin
      .from("booking_blackout_dates")
      .select("date, reason")
      .gte("date", rangeFrom)
      .lte("date", rangeTo),
  ]);

  if (jobsResult.error) throw new Error(`Unable to read jobs: ${jobsResult.error.message}`);
  // A removals table that won't read must not silently become "no removals":
  // that would hide capacity that has been given back. Same reasoning as
  // fetchSlotRemovals() in lib/syncProcessor.ts.
  if (removalsResult.error) {
    throw new Error(`Unable to read calendar_slot_removals: ${removalsResult.error.message}`);
  }
  if (blackoutsResult.error) {
    throw new Error(`Unable to read booking_blackout_dates: ${blackoutsResult.error.message}`);
  }

  const jobs = (jobsResult.data ?? []) as unknown as (CapacityJob & {
    visit_event_id?: string | null;
    job_event_id?: string | null;
    second_visit_event_id?: string | null;
  })[];

  // Everything on the Google Calendar that this app put there. Anything else
  // in the window is somebody's time that no job row knows about.
  const knownEventIds = new Set<string>();
  for (const job of jobs) {
    for (const id of [job.visit_event_id, job.job_event_id, job.second_visit_event_id]) {
      if (id) knownEventIds.add(id);
    }
  }

  // Deliberately after the database reads rather than in parallel with them:
  // the exclusion list comes from those reads, and counting our own events as
  // manual blocks would make every day look twice as busy as it is.
  const calendar = await loadCalendarBlocks(rangeFrom, rangeTo, knownEventIds);

  const days = computeAvailability({
    from: rangeFrom,
    to: rangeTo,
    jobs,
    removals: (removalsResult.data ?? []) as unknown as SlotRemovalRef[],
    blackouts: (blackoutsResult.data ?? []) as unknown as BlackoutDate[],
    blocks: calendar.blocks,
    now,
  });

  return {
    from: rangeFrom,
    to: rangeTo,
    days,
    now,
    calendarDegraded: calendar.degraded,
    calendarStale: calendar.stale,
  };
}

/**
 * Days on the wire. The pure module speaks TypeScript (workingDay); the API
 * speaks snake_case like every other field in these responses, and an adapter
 * author should not have to notice where the boundary is.
 */
export function serializeDays(days: DayAvailability[]) {
  return days.map((day) => ({
    date: day.date,
    weekday: day.weekday,
    working_day: day.workingDay,
    day_remaining: day.remainingToday,
    ...(day.blackoutReason !== undefined ? { blackout_reason: day.blackoutReason } : {}),
    ...(day.calendarBlockReason !== undefined
      ? { calendar_block_reason: day.calendarBlockReason }
      : {}),
    slots: day.slots,
  }));
}

/**
 * The constant half of the availability response — the slot vocabulary and
 * the rules behind it. Sent on every response so the assistant's adapter can
 * be built against the API rather than against a copy of these numbers.
 */
export function availabilityMeta() {
  return {
    timezone: BUSINESS_TZ,
    date_format: "YYYY-MM-DD",
    time_format: "HH:MM (24h)",
    slots: SITE_VISIT_SLOTS.map((slot) => ({
      slot: slot.id,
      label: slot.label,
      window: `${slot.windowStart}-${slot.windowEnd}`,
      capacity: slot.capacity,
    })),
    working_days: "Mon-Sat",
    daily_capacity: DAILY_APPOINTMENT_CAPACITY,
    lead_time_hours: MIN_LEAD_HOURS,
    horizon_days: AVAILABILITY_HORIZON_DAYS,
  };
}

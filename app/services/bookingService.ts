/**
 * app/services/bookingService.ts
 *
 * Server-only domain service for bookings made by the AI sales assistant.
 *
 * Every write here goes through the same post-write path as a save from the
 * dashboard — recordJobActivity, enqueueAndSync, invalidateJobCaches, all
 * imported from jobService rather than reimplemented. That is the whole point:
 * a job inserted straight into the table would never enqueue a sync row and
 * would therefore never appear on Google Calendar, silently, with nothing to
 * see on the Sync Health page because no row would exist to fail.
 *
 * The insert itself is not done here but in the book_site_visit RPC (migration
 * 20260819000000), which holds an advisory lock on the slot while it re-checks
 * capacity. Two chats offered the last slot at the same instant is not a
 * hypothetical: the assistant reads availability seconds before it writes.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  enqueueAndSync,
  invalidateJobCaches,
  recordJobActivity,
} from "@/app/services/jobService";
import {
  DAILY_APPOINTMENT_CAPACITY,
  normalizeTime,
  slotById,
  type SiteVisitSlot,
  type UnavailableReason,
} from "@/lib/availability";
import { loadAvailability } from "@/app/services/availabilityService";
import { BUSINESS_TZ } from "@/lib/appointments";
import type { CancelRequest, RescheduleRequest, SiteVisitBookingRequest } from "@/lib/bookingRequest";

type AdminClient = ReturnType<typeof createAdminClient>;

/** The identity every bot-created job is attributed to. */
export const BOOKING_BOT_NAME = "AI Assistant";

/**
 * Columns the booking responses and the sync path need. Narrower than
 * JOB_SELECT_FULL in jobService — a booking response is a receipt, not a job
 * record, and the assistant has no business seeing the money columns.
 */
const BOOKING_JOB_SELECT =
  "id, stage, status, service_type, ac_brand, unit_count, " +
  "visit_date, visit_time, visit_phone, source, internal_notes, " +
  "loss_reason, closed_at, created_at, created_by, customer_id, " +
  "booking_idempotency_key, customers(id, name, phone, address, unit_type)";

// ── Bot identity ──────────────────────────────────────────────────────────────

let cachedActorId: string | null = null;

/**
 * The auth user bookings are created as.
 *
 * jobs.created_by is a real FK to profiles and RLS is written around
 * `created_by = auth.uid()`, so bookings need an identity of their own. A
 * dedicated user rather than the service role's null: it keeps job_activity
 * attribution honest ("AI Assistant created this job", not "somebody did"),
 * and it lets an admin filter what the bot booked. Created by
 * scripts/create-booking-bot.mjs.
 */
export async function resolveBookingActorId(admin: AdminClient): Promise<string> {
  const fromEnv = process.env.BOOKING_BOT_USER_ID?.trim();
  if (fromEnv) return fromEnv;
  if (cachedActorId) return cachedActorId;

  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("full_name", BOOKING_BOT_NAME)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Unable to resolve the booking actor: ${error.message}`);
  if (!data) {
    throw new Error(
      `No '${BOOKING_BOT_NAME}' profile exists. Run: node scripts/create-booking-bot.mjs`
    );
  }

  cachedActorId = data.id as string;
  return cachedActorId;
}

// ── Shared plumbing ───────────────────────────────────────────────────────────

async function fetchBookingJob(admin: AdminClient, jobId: string) {
  const { data, error } = await admin
    .from("jobs")
    .select(BOOKING_JOB_SELECT)
    .eq("id", jobId)
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "The job could not be read back after writing it.");
  }
  return data as any;
}

function customerOf(job: any) {
  return Array.isArray(job?.customers) ? job.customers[0] : job?.customers;
}

/** The receipt the assistant gets back, and stores against the conversation. */
export function serializeBooking(job: any, slot?: SiteVisitSlot) {
  const customer = customerOf(job);
  const resolvedSlot = slot ?? (job.visit_time ? slotById(job.visit_time) : undefined);
  return {
    job_id: job.id,
    stage: job.stage,
    status: job.status,
    visit_date: job.visit_date,
    visit_time: job.visit_time,
    slot_label: resolvedSlot?.label ?? null,
    timezone: BUSINESS_TZ,
    service_type: job.service_type,
    unit_count: job.unit_count,
    ac_brand: job.ac_brand,
    source: job.source,
    visit_phone: job.visit_phone,
    internal_notes: job.internal_notes,
    idempotency_key: job.booking_idempotency_key,
    created_at: job.created_at,
    customer: customer
      ? {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          unit_type: customer.unit_type,
        }
      : null,
  };
}

/**
 * Everything saveJob() does after the row lands: history, sync queue, cache
 * invalidation. Called by every write in this module — a booking that skips
 * it is a booking that never reaches Google Calendar.
 */
async function runPostWrite(
  admin: AdminClient,
  jobId: string,
  job: any,
  options: {
    action: "created" | "updated";
    actorId: string;
    changes?: { field: string; from: unknown; to: unknown }[];
    syncCalendar: boolean;
  }
) {
  recordJobActivity(
    jobId,
    options.action,
    options.changes ?? [],
    admin,
    null,
    options.actorId
  );
  const sync = await enqueueAndSync(jobId, job, admin, options.syncCalendar);
  invalidateJobCaches();
  return sync;
}

/** The job a previous attempt with this idempotency key already created. */
async function findByIdempotencyKey(admin: AdminClient, key: string) {
  const { data, error } = await admin
    .from("jobs")
    .select(BOOKING_JOB_SELECT)
    .eq("booking_idempotency_key", key)
    .maybeSingle();
  if (error) throw new Error(`Unable to check the idempotency key: ${error.message}`);
  return data as any | null;
}

// ── Is this slot actually on offer? ───────────────────────────────────────────

/**
 * Re-runs the full availability rules for one slot, immediately before writing.
 *
 * The RPC's advisory lock re-checks capacity *from the jobs table* — that is
 * what makes two simultaneous bookings safe. It cannot see the rest of the
 * rules: a Sunday, a public holiday, a slot 20 minutes from now, or a morning
 * someone reserved by typing straight into Google Calendar. Without this check
 * an assistant that ignored the availability response, or acted on one from
 * ten minutes ago, could book any of them.
 *
 * Returns null when the slot may be taken, or the reason it may not.
 */
async function slotUnavailableReason(
  date: string,
  slot: string
): Promise<UnavailableReason | null> {
  const { days } = await loadAvailability(date, date);
  const day = days.find((d) => d.date === date);
  // Out of range entirely — loadAvailability clamps to the horizon, so an empty
  // result for a well-formed date means it is further out than we ever offer.
  if (!day) return "beyond_horizon";

  const state = day.slots.find((s) => s.slot === slot);
  if (!state) return "beyond_horizon";
  return state.available ? null : state.reason ?? "slot_full";
}

// ── Create ────────────────────────────────────────────────────────────────────

export type CreateBookingResult =
  | { status: "created" | "duplicate"; booking: ReturnType<typeof serializeBooking> }
  | {
      status: "slot_taken";
      reason: UnavailableReason;
      slotCount?: number;
      dayCount?: number;
    };

/**
 * Books a site visit. Capacity is re-checked inside the RPC's advisory lock,
 * so the answer this returns is the answer at write time, not at read time.
 *
 * A repeat of an idempotency key returns the original booking untouched — the
 * assistant retrying after a network timeout must not produce a second job and
 * a second calendar event.
 */
export async function createSiteVisitBooking(
  request: SiteVisitBookingRequest
): Promise<CreateBookingResult> {
  const admin = createAdminClient();
  const actorId = await resolveBookingActorId(admin);
  const slot = slotById(request.visitTime);
  if (!slot) throw new Error(`Unknown site-visit slot: ${request.visitTime}`);

  // Before anything else: a retry must get its original booking back, never a
  // refusal. The slot it holds is legitimately "full" — of itself — and by the
  // time a customer's network times out and the assistant retries, the visit
  // may also be inside the lead-time window it was booked outside of.
  const replay = await findByIdempotencyKey(admin, request.idempotencyKey);
  if (replay) return { status: "duplicate", booking: serializeBooking(replay, slot) };

  // Everything the lock can't see: working days, blackouts, lead time, and
  // work that only exists in Google Calendar.
  const unavailable = await slotUnavailableReason(request.visitDate, request.visitTime);
  if (unavailable) return { status: "slot_taken", reason: unavailable };

  const { data, error } = await admin.rpc("book_site_visit", {
    p_idempotency_key: request.idempotencyKey,
    p_visit_date: request.visitDate,
    p_visit_time: request.visitTime,
    // Passed in rather than hardcoded in SQL, so the read path and the write
    // path can never disagree about what "full" means.
    p_window_start: slot.windowStart,
    p_window_end: slot.windowEnd,
    p_slot_capacity: slot.capacity,
    p_day_capacity: DAILY_APPOINTMENT_CAPACITY,
    p_customer: {
      name: request.customer.name,
      phone: request.customer.phone,
      phone_match: request.customer.phoneMatch,
      address: request.customer.address,
      unit_type: request.customer.unitType,
    },
    p_job: {
      service_type: request.job.serviceType,
      ac_brand: request.job.acBrand,
      unit_count: request.job.unitCount,
      visit_phone: request.job.visitPhone,
      source: request.job.source,
      internal_notes: request.job.internalNotes,
      stage: request.job.stage,
    },
    p_created_by: actorId,
  });

  if (error) throw new Error(`book_site_visit failed: ${error.message}`);
  const result = data as {
    status: "created" | "duplicate" | "slot_taken";
    job_id?: string;
    slot_count?: number;
    day_count?: number;
  };

  if (result.status === "slot_taken") {
    // Lost the race inside the lock: someone else's booking landed between the
    // check above and this insert.
    return {
      status: "slot_taken",
      reason: (result.slot_count ?? 0) >= slot.capacity ? "slot_full" : "day_full",
      slotCount: result.slot_count ?? 0,
      dayCount: result.day_count ?? 0,
    };
  }

  const job = await fetchBookingJob(admin, result.job_id as string);

  // A replay must not enqueue a second sync or write a second activity row —
  // the original booking already did both, and the calendar event already
  // exists.
  if (result.status === "created") {
    await runPostWrite(admin, job.id, job, {
      action: "created",
      actorId,
      syncCalendar: true,
    });
  }

  return { status: result.status, booking: serializeBooking(job, slot) };
}

// ── Reschedule ────────────────────────────────────────────────────────────────

export type RescheduleResult =
  | {
      status: "rescheduled" | "unchanged";
      booking: ReturnType<typeof serializeBooking>;
      previous?: { visit_date: string | null; visit_time: string | null };
    }
  | { status: "not_found" }
  | { status: "closed" }
  | {
      status: "slot_taken";
      reason: UnavailableReason;
      slotCount?: number;
      dayCount?: number;
    };

/**
 * Moves an existing site visit to another slot. Goes through its own RPC for
 * the same reason a booking does: a reschedule into the last free slot races
 * a booking into that slot, and the loser has to be told which it was.
 *
 * The calendar event is not touched here. Changing visit_date/visit_time
 * enqueues a calendar sync, and syncProcessor updates the existing event in
 * place — including dropping any stale "someone deleted this by hand" record,
 * because a reschedule is a fresh statement that the visit is happening.
 */
export async function rescheduleSiteVisit(
  request: RescheduleRequest
): Promise<RescheduleResult> {
  const admin = createAdminClient();
  const actorId = await resolveBookingActorId(admin);
  const slot = slotById(request.visitTime);
  if (!slot) throw new Error(`Unknown site-visit slot: ${request.visitTime}`);

  // A repeat of a reschedule that already went through must settle, not fail —
  // including when the slot it moved to is now inside the lead-time window. So
  // "is it already there?" is asked before "may it go there?".
  const { data: current } = await admin
    .from("jobs")
    .select("visit_date, visit_time")
    .eq("id", request.jobId)
    .maybeSingle();
  const alreadyThere =
    current?.visit_date === request.visitDate &&
    normalizeTime(current?.visit_time) === normalizeTime(request.visitTime);

  if (!alreadyThere) {
    const unavailable = await slotUnavailableReason(request.visitDate, request.visitTime);
    // A job already sitting on the slot fills it, so "full" here may just be
    // the job itself; the RPC re-checks excluding it.
    if (unavailable && unavailable !== "slot_full" && unavailable !== "day_full") {
      return { status: "slot_taken", reason: unavailable };
    }
  }

  const { data, error } = await admin.rpc("reschedule_site_visit", {
    p_job_id: request.jobId,
    p_visit_date: request.visitDate,
    p_visit_time: request.visitTime,
    p_window_start: slot.windowStart,
    p_window_end: slot.windowEnd,
    p_slot_capacity: slot.capacity,
    p_day_capacity: DAILY_APPOINTMENT_CAPACITY,
  });

  if (error) throw new Error(`reschedule_site_visit failed: ${error.message}`);
  const result = data as {
    status: "rescheduled" | "unchanged" | "not_found" | "closed" | "slot_taken";
    previous_date?: string | null;
    previous_time?: string | null;
    slot_count?: number;
    day_count?: number;
  };

  if (result.status === "not_found") return { status: "not_found" };
  if (result.status === "closed") return { status: "closed" };
  if (result.status === "slot_taken") {
    return {
      status: "slot_taken",
      reason: (result.slot_count ?? 0) >= slot.capacity ? "slot_full" : "day_full",
      slotCount: result.slot_count ?? 0,
      dayCount: result.day_count ?? 0,
    };
  }

  const job = await fetchBookingJob(admin, request.jobId);

  if (result.status === "rescheduled") {
    await runPostWrite(admin, job.id, job, {
      action: "updated",
      actorId,
      changes: [
        { field: "visit_date", from: result.previous_date ?? null, to: job.visit_date },
        { field: "visit_time", from: result.previous_time ?? null, to: job.visit_time },
      ],
      syncCalendar: true,
    });
  }

  return {
    status: result.status,
    booking: serializeBooking(job, slot),
    previous: {
      visit_date: result.previous_date ?? null,
      visit_time: result.previous_time ?? null,
    },
  };
}

// ── Cancel ────────────────────────────────────────────────────────────────────

export type CancelResult =
  | {
      status: "cancelled" | "already_cancelled";
      booking: ReturnType<typeof serializeBooking>;
    }
  | { status: "not_found" };

/**
 * Cancels a booked site visit.
 *
 * Three things happen, and each is deliberate:
 *   - loss_reason + closed_at + status are set, which is how the rest of the
 *     app recognises a job nobody is working: it drops out of the attention
 *     lists, stops counting as open in analytics, and — via
 *     isCapacityConsuming() — stops consuming the slot so it can be re-sold.
 *   - visit_date/visit_time are cleared, because that is the only thing
 *     syncProcessor reads as "take this off the calendar". Leaving the date on
 *     a cancelled job would leave the engineer's calendar showing a visit
 *     nobody is making.
 *   - the slot that was cleared is written into internal_notes first, so the
 *     office can still see what was cancelled and when.
 */
export async function cancelSiteVisit(request: CancelRequest): Promise<CancelResult> {
  const admin = createAdminClient();
  const actorId = await resolveBookingActorId(admin);

  const { data: existing, error: readError } = await admin
    .from("jobs")
    .select(BOOKING_JOB_SELECT)
    .eq("id", request.jobId)
    .maybeSingle();

  if (readError) throw new Error(`Unable to read the job: ${readError.message}`);
  if (!existing) return { status: "not_found" };

  const job = existing as any;
  const alreadyCancelled =
    Boolean(job.closed_at) ||
    Boolean(job.loss_reason?.trim()) ||
    (job.status && job.status !== "open");

  if (alreadyCancelled) {
    return { status: "already_cancelled", booking: serializeBooking(job) };
  }

  const cancelledAt = new Date().toISOString();
  const trail =
    job.visit_date != null
      ? `Cancelled ${cancelledAt.slice(0, 10)} — site visit was ${job.visit_date}` +
        `${job.visit_time ? ` ${job.visit_time}` : ""} (${request.reason}).`
      : `Cancelled ${cancelledAt.slice(0, 10)} (${request.reason}).`;

  const { data: updated, error: updateError } = await admin
    .from("jobs")
    .update({
      status: "closed",
      loss_reason: request.reason,
      closed_at: cancelledAt,
      visit_date: null,
      visit_time: null,
      internal_notes: [job.internal_notes, trail].filter(Boolean).join("\n\n"),
    })
    .eq("id", request.jobId)
    .select(BOOKING_JOB_SELECT)
    .single();

  if (updateError) throw new Error(`Unable to cancel the job: ${updateError.message}`);

  await runPostWrite(admin, request.jobId, updated, {
    action: "updated",
    actorId,
    changes: [
      { field: "visit_date", from: job.visit_date, to: null },
      { field: "visit_time", from: job.visit_time, to: null },
      { field: "loss_reason", from: job.loss_reason ?? null, to: request.reason },
      { field: "status", from: job.status ?? "open", to: "closed" },
    ],
    syncCalendar: true,
  });

  return { status: "cancelled", booking: serializeBooking(updated) };
}

/**
 * app/services/jobService.ts
 *
 * Server-only domain service for jobs.
 * All direct Supabase mutations for jobs live here.
 * Server Actions call these functions; they never write to the DB themselves.
 *
 * External syncs (Calendar / Sheets backup / Meta-lead) are never awaited
 * inline here — that used to expose every save to external-API latency and
 * Vercel's serverless timeout, which is how a Calendar sync once failed
 * silently. Instead, a save enqueues sync_queue rows and schedules
 * processJobQueue() via after() to run once the response has been sent
 * (see lib/syncProcessor.ts). Failures are retried with backoff and surfaced
 * durably on the Job Detail page instead of a one-time alert().
 */

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { deleteCalendarEvent, getCalendarEventStart } from "@/lib/googleCalendar";
import { getStageDB } from "@/lib/constants";
import {
  processJobQueue,
  processQueueRow,
  syncCalendarNow,
  type SyncIntegration,
} from "@/lib/syncProcessor";
import { diffJob, affectsCalendar, CALENDAR_JOB_FIELDS, type FieldChange } from "@/lib/jobDiff";

/** Invalidates all cached job data for a specific user + the admin dashboard. */
function invalidateJobCaches(userId?: string) {
  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard");
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// ── Internal sync enqueue ─────────────────────────────────────────────────────

/** The columns whose presence means this job belongs on the calendar at all. */
const DATE_FIELDS = CALENDAR_JOB_FIELDS.filter((f) => f.endsWith("_date"));

function hasAnyScheduledDate(job: any): boolean {
  return DATE_FIELDS.some((f) => {
    const v = job?.[f];
    return typeof v === "string" ? v.trim() !== "" : Boolean(v);
  });
}

export type SyncOutcome = {
  /** Calendar sync ran and failed — surfaced to the user immediately. */
  calendarError?: string;
  /** Calendar sync is still running in the background; result not known yet. */
  calendarPending?: boolean;
};

/**
 * Queues the integrations this save actually needs and returns immediately.
 *
 * Saves used to block on the Calendar round trip for confirmation, which cost
 * seconds per save (a Calendar write alone is ~2s) and made the app feel slow.
 * The confirmation is no longer worth blocking for: the client polls the
 * result a moment later via getJobSyncStatus, and a failure is durably visible
 * on the job banner, the Sync Health page and the daily email regardless.
 *
 * `syncCalendar` is decided by a real field diff, so most saves don't touch
 * Google at all — editing notes on a completed job now queues nothing.
 */
async function enqueueAndSync(
  jobId: string,
  job: any,
  supabase: SupabaseClient,
  syncCalendar: boolean
): Promise<SyncOutcome> {
  const integrations: SyncIntegration[] = ["sheets"];
  if (job?.source === "Meta") integrations.push("meta_lead");
  if (syncCalendar) integrations.push("calendar");

  // In parallel — these were sequential, costing a full round trip each.
  await Promise.all(
    integrations.map((integration) =>
      supabase.rpc("enqueue_sync", { p_job_id: jobId, p_integration: integration })
    )
  );

  after(() => processJobQueue(jobId));

  return syncCalendar ? { calendarPending: true } : {};
}

/**
 * Current sync state for a job, so the client can pick up the outcome shortly
 * after a save without having made the save itself wait for it.
 */
export async function getJobSyncStatus(
  jobId: string
): Promise<{ pending: boolean; calendarError?: string }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("sync_queue")
    .select("integration, status, last_error")
    .eq("job_id", jobId)
    .eq("integration", "calendar")
    .maybeSingle();

  if (!data) return { pending: false };
  return {
    pending: data.status === "pending" || data.status === "processing",
    calendarError: data.last_error ?? undefined,
  };
}

/** Reads the row as it stands so a save can be diffed against it. */
async function fetchCurrentJob(jobId: string, supabase: SupabaseClient) {
  const { data } = await supabase.from("jobs").select("*").eq("id", jobId).single();
  return data;
}

/**
 * Records what a person changed on a job. Best-effort: history is valuable
 * but never worth failing a save over.
 *
 * Written with the admin client (so RLS doesn't have to grant every staff
 * role insert rights) with the actor captured explicitly. No-op changes are
 * skipped, which keeps the debounced quotation autosave from filling the
 * timeline with empty entries.
 */
function recordJobActivity(
  jobId: string,
  action: "created" | "updated" | "deleted",
  changes: FieldChange[],
  supabase: SupabaseClient,
  /** Human-readable snapshot — the only way to identify a deleted job later. */
  jobLabel?: string | null
): void {
  if (action === "updated" && changes.length === 0) return;

  // Written after the response is sent. Resolving the actor alone costs a
  // round trip to the auth server, and nobody should wait on writing a log
  // entry. after() keeps it alive on serverless, so it still gets recorded.
  after(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      await createAdminClient().from("job_activity").insert({
        job_id: jobId,
        actor_id: auth?.user?.id ?? null,
        action,
        changes,
        job_label: jobLabel ?? null,
      });
    } catch (err) {
      console.error("[jobActivity] failed to record activity:", err);
    }
  });
}

// ── Exported service functions ────────────────────────────────────────────────

/**
 * Transitions a job to a new stage and applies any additional field updates.
 * Handles the "First Visit" → "In Progress" DB mapping transparently.
 * Queues Calendar/Sheets sync after the DB write.
 */
export async function transitionStage(
  jobId: string,
  targetStage: string,
  updates: Record<string, any> = {}
): Promise<{ success?: boolean; error?: string } & SyncOutcome> {
  const supabase = await createClient();
  const dbStage = getStageDB(targetStage);
  const payload = { stage: dbStage, ...updates };

  const before = await fetchCurrentJob(jobId, supabase);

  const { data: updatedJob, error } = await supabase
    .from("jobs")
    .update(payload)
    .eq("id", jobId)
    .select("*, customers(id, name, phone, address, unit_type)")
    .single();

  if (error) return { error: error.message };

  const changes = diffJob(before, payload);
  recordJobActivity(jobId, "updated", changes, supabase);
  const sync = await enqueueAndSync(jobId, updatedJob, supabase, affectsCalendar(changes));

  invalidateJobCaches();
  return { success: true, ...sync };
}

/**
 * Updates arbitrary fields on a job (no stage-transition logic).
 * Used by the admin edit form and the Job Detail page.
 * Queues Calendar/Sheets sync after the DB write.
 */
export async function updateFields(
  jobId: string,
  updates: Record<string, any>
): Promise<{
  success?: boolean;
  data?: any;
  error?: string;
} & SyncOutcome> {
  const supabase = await createClient();

  const before = await fetchCurrentJob(jobId, supabase);

  const { data, error } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", jobId)
    .select("*, customers(id, name, phone, address, unit_type)")
    .single();

  if (error) return { error: error.message };

  const changes = diffJob(before, updates);
  recordJobActivity(jobId, "updated", changes, supabase);
  const sync = await enqueueAndSync(jobId, data, supabase, affectsCalendar(changes));

  invalidateJobCaches();
  return { success: true, data, ...sync };
}

/**
 * Re-runs sync for a single job/integration pair immediately (not queued),
 * so the "Retry" banner on the Job Detail page can show pass/fail right away.
 */
export async function retrySync(
  jobId: string,
  integration: SyncIntegration
): Promise<{ success?: boolean; error?: string }> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: row, error } = await admin
    .from("sync_queue")
    .update({ status: "processing", attempts: 0, claimed_at: nowIso, updated_at: nowIso })
    .eq("job_id", jobId)
    .eq("integration", integration)
    .select()
    .single();

  if (error || !row) {
    return { error: error?.message ?? "No sync record found for this job/integration." };
  }

  await processQueueRow(admin, row as any);

  const { data: finalRow } = await admin
    .from("sync_queue")
    .select("last_error")
    .eq("id", row.id)
    .single();

  invalidateJobCaches();
  return finalRow?.last_error ? { error: finalRow.last_error } : { success: true };
}

/** Column pairs backing each calendar slot. */
const SLOT_COLUMNS = {
  site_visit: { date: "visit_date", time: "visit_time" },
  job: { date: "job_date", time: "job_time" },
  second_visit: { date: "second_visit_date", time: "second_visit_time" },
} as const;

/**
 * Resolves a start-time conflict between the app and Google Calendar.
 *
 * "accept_calendar" writes Google's time back into the job, which is usually
 * the right answer when someone deliberately rescheduled in Calendar: it also
 * fixes the invoices, reports and Sheets backup that read these columns, and
 * the conflict then disappears by construction rather than needing to be
 * acknowledged and remembered.
 *
 * "keep_app" forces a re-sync, overwriting Calendar with the app's time.
 */
export async function resolveCalendarConflict(
  jobId: string,
  eventType: keyof typeof SLOT_COLUMNS,
  resolution: "accept_calendar" | "keep_app"
): Promise<{ success?: boolean; error?: string } & SyncOutcome> {
  const supabase = await createClient();
  const cols = SLOT_COLUMNS[eventType];
  if (!cols) return { error: "Unknown calendar slot." };

  if (resolution === "keep_app") {
    await supabase.rpc("enqueue_sync", { p_job_id: jobId, p_integration: "calendar" });
    const { calendarError } = await syncCalendarNow(jobId);
    invalidateJobCaches();
    return calendarError ? { error: calendarError } : { success: true };
  }

  // accept_calendar — read the event's real start and store it on the job.
  const admin = createAdminClient();
  const { data: job } = await admin
    .from("jobs")
    .select(`${cols.date}, ${cols.time}, visit_event_id, job_event_id, second_visit_event_id`)
    .eq("id", jobId)
    .single();

  const eventIdColumn =
    eventType === "site_visit" ? "visit_event_id" : eventType === "job" ? "job_event_id" : "second_visit_event_id";
  const eventId = (job as any)?.[eventIdColumn];
  if (!eventId) return { error: "This slot has no calendar event to accept." };

  const actual = await getCalendarEventStart(eventId);
  if (!actual) return { error: "Could not read the event's current time from Google Calendar." };

  // Store in the calendar's own timezone so the date/time pair matches what
  // people see in Calendar, not the server's locale.
  const updates = { [cols.date]: actual.date, [cols.time]: actual.time };
  return updateFields(jobId, updates);
}

/**
 * Permanently deletes a job and all its associated Google Calendar events.
 */
export async function deleteJob(
  jobId: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();

  // Capture enough to identify what was destroyed *before* destroying it —
  // afterwards there is nothing left to look up.
  const { data: job, error: fetchError } = await supabase
    .from("jobs")
    .select(
      "visit_event_id, job_event_id, second_visit_event_id, stage, service_type, " +
        "visit_date, job_date, second_visit_date, quoted_amount, customers(name, phone)"
    )
    .eq("id", jobId)
    .single();

  if (fetchError) return { error: fetchError.message };

  const eventEntries = [
    { id: (job as any)?.visit_event_id, type: "site_visit" as const },
    { id: (job as any)?.job_event_id, type: "job" as const },
    { id: (job as any)?.second_visit_event_id, type: "second_visit" as const },
  ].filter((e) => e.id) as { id: string; type: "site_visit" | "job" | "second_visit" }[];

  const customer = Array.isArray((job as any)?.customers)
    ? (job as any).customers[0]
    : (job as any)?.customers;

  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  if (error) return { error: error.message };

  // Recorded after the delete succeeds, so the log never claims a deletion
  // that didn't happen. job_activity intentionally has no foreign key to jobs
  // (see migration 20260801000000) so this record outlives the job.
  recordJobActivity(
    jobId,
    "deleted",
    [
      { field: "stage", from: (job as any)?.stage ?? null, to: null },
      { field: "service_type", from: (job as any)?.service_type ?? null, to: null },
      { field: "visit_date", from: (job as any)?.visit_date ?? null, to: null },
      { field: "job_date", from: (job as any)?.job_date ?? null, to: null },
      { field: "quoted_amount", from: (job as any)?.quoted_amount ?? null, to: null },
    ].filter((c) => c.from !== null),
    supabase,
    customer?.name ? `${customer.name}${customer.phone ? ` (${customer.phone})` : ""}` : null
  );

  // Calendar cleanup runs *after* the response is sent, so the delete feels
  // instant instead of blocking on 1-3 external Google Calendar calls. after()
  // (unlike a bare un-awaited promise) is kept alive by the runtime until it
  // finishes, so events still get cleaned up on Vercel serverless.
  if (eventEntries.length > 0) {
    after(() =>
      Promise.allSettled(
        eventEntries.map(({ id, type }) => deleteCalendarEvent(id, { jobId, type }))
      )
    );
  }

  invalidateJobCaches();
  return { success: true };
}

/**
 * Creates a new job or updates an existing one.
 * Handles optional new-customer creation atomically.
 * Queues Calendar/Sheets sync after the DB write.
 */
export async function saveJob(
  dataToSave: any,
  newCustomerData?: {
    name: string;
    phone?: string | null;
    address?: string | null;
    unit_type?: string | null;
  }
): Promise<{
  success?: boolean;
  savedJob?: any;
  error?: string;
} & SyncOutcome> {
  const supabase = await createClient();

  try {
    let finalCustomerId = dataToSave.customer_id;

    if (newCustomerData) {
      const { data: newCust, error: custErr } = await supabase
        .from("customers")
        .insert([
          {
            name: newCustomerData.name,
            phone: newCustomerData.phone ?? null,
            address: newCustomerData.address ?? null,
            unit_type: newCustomerData.unit_type ?? null,
          },
        ])
        .select()
        .single();

      if (custErr) return { error: custErr.message };
      finalCustomerId = newCust.id;
    }

    const payload = { ...dataToSave, customer_id: finalCustomerId };
    let fullJob: any;

    const JOB_SELECT_FULL = "id, stage, service_type, ac_brand, unit_count, visit_date, visit_time, job_date, job_time, second_visit_date, second_visit_time, payment_status, notes, labor_cost, quoted_amount, material_cost, priority, source, service_report_no, internal_notes, quoted_date, expiry_date, status, loss_reason, closed_at, created_at, deposit_amount, deposit_collected, cv_redeemed, cv_amount, final_payment_collected, quotation_breakdown, quotation_materials, quotation_warranty, engineer_name, visit_event_id, job_event_id, second_visit_event_id, customer_id, created_by, assigned_to, customers(id, name, phone, address, unit_type)";

    let syncCalendar: boolean;

    if (!payload.id) {
      const { data, error: insertError } = await supabase
        .from("jobs")
        .insert([payload])
        .select(JOB_SELECT_FULL)
        .single();
      if (insertError) return { error: insertError.message };
      fullJob = data;
      // A brand new job needs a calendar event only if it's actually scheduled.
      syncCalendar = hasAnyScheduledDate(fullJob);
      recordJobActivity(fullJob.id, "created", [], supabase);
    } else {
      const { id, ...updatePayload } = payload;
      const before = await fetchCurrentJob(id, supabase);
      const { data, error: updateError } = await supabase
        .from("jobs")
        .update(updatePayload)
        .eq("id", id)
        .select(JOB_SELECT_FULL)
        .single();
      if (updateError) return { error: updateError.message };
      fullJob = data;
      const changes = diffJob(before, updatePayload);
      recordJobActivity(id, "updated", changes, supabase);
      syncCalendar = affectsCalendar(changes);
    }

    const sync = await enqueueAndSync(fullJob.id, fullJob, supabase, syncCalendar);

    invalidateJobCaches();
    return { success: true, savedJob: fullJob, ...sync };
  } catch (err: any) {
    return { error: err.message };
  }
}

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
import { deleteCalendarEvent } from "@/lib/googleCalendar";
import { getStageDB } from "@/lib/constants";
import {
  processJobQueue,
  processQueueRow,
  syncCalendarNow,
  type SyncIntegration,
} from "@/lib/syncProcessor";
import { diffJob, affectsCalendar, CALENDAR_JOB_FIELDS } from "@/lib/jobDiff";

/** Invalidates all cached job data for a specific user + the admin dashboard. */
function invalidateJobCaches(userId?: string) {
  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard");
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// ── Internal sync enqueue ─────────────────────────────────────────────────────

/** How long a save will wait for calendar confirmation before backgrounding it. */
const CALENDAR_CONFIRM_TIMEOUT_MS = 4000;

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
  /** Calendar sync is taking longer than the inline wait; still running. */
  calendarPending?: boolean;
};

/**
 * Queues the integrations this save actually needs, then — when the calendar
 * is among them — waits briefly for the calendar result so the person who
 * made the change is told right away if it failed.
 *
 * `syncCalendar` is decided by a real field diff. Previously every save
 * re-pushed all three calendar events, which meant editing the notes on a
 * completed job generated calendar traffic and log noise for nothing.
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

  for (const integration of integrations) {
    await supabase.rpc("enqueue_sync", { p_job_id: jobId, p_integration: integration });
  }

  // Nothing calendar-related changed — everything can finish in the background.
  if (!syncCalendar) {
    after(() => processJobQueue(jobId));
    return {};
  }

  const run = syncCalendarNow(jobId);

  // Always hand the same promise to after(), so hitting the timeout degrades
  // to background completion instead of abandoning an in-flight request.
  after(async () => {
    const { background } = await run.catch(() => ({ background: Promise.resolve() }));
    await background.catch(() => {});
  });

  const timedOut = Symbol("timeout");
  const raced = await Promise.race([
    run,
    new Promise<typeof timedOut>((resolve) =>
      setTimeout(() => resolve(timedOut), CALENDAR_CONFIRM_TIMEOUT_MS)
    ),
  ]);

  if (raced === timedOut) return { calendarPending: true };
  return raced.calendarError ? { calendarError: raced.calendarError } : {};
}

/** Reads the row as it stands so a save can be diffed against it. */
async function fetchCurrentJob(jobId: string, supabase: SupabaseClient) {
  const { data } = await supabase.from("jobs").select("*").eq("id", jobId).single();
  return data;
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

/**
 * Permanently deletes a job and all its associated Google Calendar events.
 */
export async function deleteJob(
  jobId: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: job, error: fetchError } = await supabase
    .from("jobs")
    .select("visit_event_id, job_event_id, second_visit_event_id")
    .eq("id", jobId)
    .single();

  if (fetchError) return { error: fetchError.message };

  const eventEntries = [
    { id: (job as any)?.visit_event_id, type: "site_visit" as const },
    { id: (job as any)?.job_event_id, type: "job" as const },
    { id: (job as any)?.second_visit_event_id, type: "second_visit" as const },
  ].filter((e) => e.id) as { id: string; type: "site_visit" | "job" | "second_visit" }[];

  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  if (error) return { error: error.message };

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
      syncCalendar = affectsCalendar(diffJob(before, updatePayload));
    }

    const sync = await enqueueAndSync(fullJob.id, fullJob, supabase, syncCalendar);

    invalidateJobCaches();
    return { success: true, savedJob: fullJob, ...sync };
  } catch (err: any) {
    return { error: err.message };
  }
}

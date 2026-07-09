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
import { processJobQueue, processQueueRow, type SyncIntegration } from "@/lib/syncProcessor";

/** Invalidates all cached job data for a specific user + the admin dashboard. */
function invalidateJobCaches(userId?: string) {
  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard");
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// ── Internal sync enqueue ─────────────────────────────────────────────────────

/**
 * Queues Calendar + Sheets (+ Meta-lead, if applicable) sync for a job and
 * schedules background processing. Returns as soon as the rows are queued —
 * the actual external API calls happen after this request's response is sent.
 */
async function enqueueAndProcess(
  jobId: string,
  job: any,
  supabase: SupabaseClient
): Promise<void> {
  const integrations: SyncIntegration[] = ["calendar", "sheets"];
  if (job?.source === "Meta") integrations.push("meta_lead");

  for (const integration of integrations) {
    await supabase.rpc("enqueue_sync", { p_job_id: jobId, p_integration: integration });
  }

  after(() => processJobQueue(jobId));
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
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const dbStage = getStageDB(targetStage);

  const { data: updatedJob, error } = await supabase
    .from("jobs")
    .update({ stage: dbStage, ...updates })
    .eq("id", jobId)
    .select("*, customers(id, name, phone, address, unit_type)")
    .single();

  if (error) return { error: error.message };

  await enqueueAndProcess(jobId, updatedJob, supabase);

  invalidateJobCaches();
  return { success: true };
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
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", jobId)
    .select("*, customers(id, name, phone, address, unit_type)")
    .single();

  if (error) return { error: error.message };

  await enqueueAndProcess(jobId, data, supabase);

  invalidateJobCaches();
  return { success: true, data };
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

  const eventIds = [
    (job as any)?.visit_event_id,
    (job as any)?.job_event_id,
    (job as any)?.second_visit_event_id,
  ].filter(Boolean) as string[];

  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  if (error) return { error: error.message };

  // Await all calendar deletions — must complete before returning on Vercel serverless
  // (un-awaited promises are killed when the function exits, leaving orphaned calendar events)
  await Promise.allSettled(eventIds.map((id) => deleteCalendarEvent(id)));

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
}> {
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

    if (!payload.id) {
      const { data, error: insertError } = await supabase
        .from("jobs")
        .insert([payload])
        .select(JOB_SELECT_FULL)
        .single();
      if (insertError) return { error: insertError.message };
      fullJob = data;
    } else {
      const { id, ...updatePayload } = payload;
      const { data, error: updateError } = await supabase
        .from("jobs")
        .update(updatePayload)
        .eq("id", id)
        .select(JOB_SELECT_FULL)
        .single();
      if (updateError) return { error: updateError.message };
      fullJob = data;
    }

    await enqueueAndProcess(fullJob.id, fullJob, supabase);

    invalidateJobCaches();
    return { success: true, savedJob: fullJob };
  } catch (err: any) {
    return { error: err.message };
  }
}

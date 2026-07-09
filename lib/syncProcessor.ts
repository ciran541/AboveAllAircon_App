/**
 * lib/syncProcessor.ts
 *
 * Shared processing logic for the sync_queue table (see migration
 * 20260709000000_add_calendar_sync_status.sql). One row per (job, integration)
 * tracks whether that job's Calendar / Sheets backup / Meta-lead sync is
 * pending, in flight, succeeded, or has failed after retries.
 *
 * This same processQueueRow() function is invoked from three places:
 *   - after() right after a job save (app/services/jobService.ts) — the
 *     common case, runs within seconds of the save without blocking it
 *   - the daily cron safety net (app/api/cron/process-sync-queue/route.ts)
 *     for anything after() didn't manage to finish
 *   - the manual "Retry" action (jobService.retrySync), for immediate
 *     user-triggered feedback
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { batchSyncCalendarEvents } from "@/lib/googleCalendar";
import { logJobToSheets, logMetaLeadToSheets } from "@/lib/sheetsBackup";

type AdminClient = ReturnType<typeof createAdminClient>;

export type SyncIntegration = "calendar" | "sheets" | "meta_lead";

export type SyncQueueRow = {
  id: string;
  job_id: string;
  integration: SyncIntegration;
  attempts: number;
  max_attempts: number;
};

const JOB_SYNC_SELECT =
  "id, service_type, notes, source, stage, ac_brand, unit_count, " +
  "visit_date, visit_time, job_date, job_time, second_visit_date, second_visit_time, " +
  "visit_event_id, job_event_id, second_visit_event_id, " +
  "quoted_amount, labor_cost, deposit_amount, deposit_collected, cv_redeemed, cv_amount, " +
  "final_payment_collected, payment_status, engineer_name, created_at, " +
  "customers(name, phone, address, unit_type)";

function backoffMinutes(attempts: number): number {
  return Math.min(2 ** attempts, 30);
}

async function fetchJobForSync(admin: AdminClient, jobId: string) {
  const { data: job, error } = await admin
    .from("jobs")
    .select(JOB_SYNC_SELECT)
    .eq("id", jobId)
    .single();
  if (error || !job) throw new Error(error?.message ?? "Unable to fetch job for sync.");
  return job as any;
}

/**
 * Reconciles all three calendar event types (site visit, job, second visit)
 * for a job: date present → upsert, date absent → delete stale event.
 */
async function syncCalendarForJob(admin: AdminClient, jobId: string): Promise<void> {
  const job = await fetchJobForSync(admin, jobId);
  const customers = Array.isArray(job.customers) ? job.customers[0] : job.customers;
  const jobBase = { id: job.id, service_type: job.service_type, notes: job.notes, customers };

  const schedule = [
    { type: "site_visit" as const, date: job.visit_date, time: job.visit_time, existingId: job.visit_event_id, col: "visit_event_id" },
    { type: "job" as const, date: job.job_date, time: job.job_time, existingId: job.job_event_id, col: "job_event_id" },
    { type: "second_visit" as const, date: job.second_visit_date, time: job.second_visit_time, existingId: job.second_visit_event_id, col: "second_visit_event_id" },
  ];

  const upserts = schedule
    .filter((s) => s.date)
    .map((s) => ({ type: s.type, job: jobBase, date: s.date as string, time: s.time ?? null, existingEventId: s.existingId, col: s.col }));

  const deletes = schedule
    .filter((s) => !s.date && s.existingId)
    .map((s) => ({ eventId: s.existingId as string, col: s.col }));

  if (upserts.length === 0 && deletes.length === 0) return;

  const { saved, cleared, errors } = await batchSyncCalendarEvents({ upserts, deletes });

  const dbUpdate: Record<string, string | null> = {};
  for (const [col, eventId] of Object.entries(saved)) dbUpdate[col] = eventId;
  for (const col of cleared) dbUpdate[col] = null;
  if (Object.keys(dbUpdate).length > 0) {
    await admin.from("jobs").update(dbUpdate).eq("id", jobId);
  }

  if (errors.length > 0) throw new Error(errors.join(" | "));
}

/** Processes a single claimed sync_queue row and writes back its outcome. */
export async function processQueueRow(admin: AdminClient, row: SyncQueueRow): Promise<void> {
  try {
    if (row.integration === "calendar") {
      await syncCalendarForJob(admin, row.job_id);
    } else if (row.integration === "sheets") {
      const job = await fetchJobForSync(admin, row.job_id);
      await logJobToSheets(job);
    } else if (row.integration === "meta_lead") {
      const job = await fetchJobForSync(admin, row.job_id);
      await logMetaLeadToSheets(job);
    }

    await admin
      .from("sync_queue")
      .update({ status: "success", last_error: null, updated_at: new Date().toISOString() })
      .eq("id", row.id);
  } catch (err: any) {
    const message = err?.message ?? String(err);
    const outOfAttempts = row.attempts >= row.max_attempts;
    await admin
      .from("sync_queue")
      .update({
        status: outOfAttempts ? "failed" : "pending",
        last_error: message,
        next_attempt_at: outOfAttempts
          ? undefined
          : new Date(Date.now() + backoffMinutes(row.attempts) * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }
}

/**
 * Claims and processes all currently-due sync_queue rows for one job.
 * Scheduled via after() right after a job mutation's response is sent —
 * runs in the background without adding external-API latency to the save.
 */
export async function processJobQueue(jobId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: claimed, error } = await admin.rpc("claim_sync_queue_batch", {
    p_limit: 10,
    p_stale_after: "10 minutes",
    p_job_id: jobId,
  });
  if (error || !claimed) return;
  await Promise.allSettled((claimed as SyncQueueRow[]).map((row) => processQueueRow(admin, row)));
}

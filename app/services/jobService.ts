/**
 * app/services/jobService.ts
 *
 * Server-only domain service for jobs.
 * All direct Supabase mutations for jobs live here.
 * Server Actions call these functions; they never write to the DB themselves.
 */

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { upsertCalendarEvent, deleteCalendarEvent } from "@/lib/googleCalendar";
import { getStageDB } from "@/lib/constants";

/** Invalidates all cached job data for a specific user + the admin dashboard. */
function invalidateJobCaches(userId?: string) {
  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard");
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// ── Internal calendar sync ────────────────────────────────────────────────────

/**
 * Reads the current job row and reconciles all three calendar event types
 * (site visit, job-scheduled, second visit):
 *   - date present  → upsert, persist returned eventId
 *   - date absent   → delete (if one exists), clear eventId
 *
 * Calendar errors are non-fatal: returns them as a string so the caller
 * can surface a soft warning without blocking the UI.
 */
async function syncAllCalendarEvents(
  jobId: string,
  supabase: SupabaseClient
): Promise<{ calendarError?: string }> {
  const { data: job, error: fetchError } = await supabase
    .from("jobs")
    .select(
      "id, service_type, notes, " +
        "visit_date, visit_time, job_date, job_time, second_visit_date, second_visit_time, " +
        "visit_event_id, job_event_id, second_visit_event_id, " +
        "customers(name, phone, address)"
    )
    .eq("id", jobId)
    .single();

  if (fetchError || !job) {
    return {
      calendarError:
        fetchError?.message ?? "Unable to fetch job for calendar sync.",
    };
  }

  const jobData = job as any;
  const customers = Array.isArray(jobData.customers)
    ? jobData.customers[0]
    : jobData.customers;
  const jobBase = {
    id: jobData.id,
    service_type: jobData.service_type,
    notes: jobData.notes,
    customers,
  };

  const schedule = [
    {
      type: "site_visit" as const,
      date: jobData.visit_date as string | null,
      time: jobData.visit_time as string | null,
      existingId: jobData.visit_event_id as string | null,
      col: "visit_event_id",
    },
    {
      type: "job" as const,
      date: jobData.job_date as string | null,
      time: jobData.job_time as string | null,
      existingId: jobData.job_event_id as string | null,
      col: "job_event_id",
    },
    {
      type: "second_visit" as const,
      date: jobData.second_visit_date as string | null,
      time: jobData.second_visit_time as string | null,
      existingId: jobData.second_visit_event_id as string | null,
      col: "second_visit_event_id",
    },
  ];

  const errors: string[] = [];

  for (const s of schedule) {
    try {
      if (s.date) {
        const { eventId } = await upsertCalendarEvent({
          type: s.type,
          job: jobBase,
          date: s.date,
          time: s.time ?? null,
          existingEventId: s.existingId,
        });
        await supabase
          .from("jobs")
          .update({ [s.col]: eventId })
          .eq("id", jobId);
      } else if (s.existingId) {
        await deleteCalendarEvent(s.existingId);
        await supabase
          .from("jobs")
          .update({ [s.col]: null })
          .eq("id", jobId);
      }
    } catch (err: any) {
      errors.push(`[${s.type}] ${err.message}`);
    }
  }

  return errors.length > 0 ? { calendarError: errors.join(" | ") } : {};
}

// ── Exported service functions ────────────────────────────────────────────────

/**
 * Transitions a job to a new stage and applies any additional field updates.
 * Handles the "First Visit" → "In Progress" DB mapping transparently.
 * Syncs all Google Calendar events after the DB write.
 */
export async function transitionStage(
  jobId: string,
  targetStage: string,
  updates: Record<string, any> = {}
): Promise<{ success?: boolean; calendarError?: string | null; error?: string }> {
  const supabase = await createClient();
  const dbStage = getStageDB(targetStage);

  const { error } = await supabase
    .from("jobs")
    .update({ stage: dbStage, ...updates })
    .eq("id", jobId);

  if (error) return { error: error.message };

  // Run Google Calendar sync asynchronously to avoid blocking the UI
  syncAllCalendarEvents(jobId, supabase).catch((err) =>
    console.error("Background calendar sync failed:", err)
  );

  invalidateJobCaches();
  return { success: true, calendarError: null };
}

/**
 * Updates arbitrary fields on a job (no stage-transition logic).
 * Used by the admin edit form and the Job Detail page.
 * Syncs all Google Calendar events after the DB write.
 */
export async function updateFields(
  jobId: string,
  updates: Record<string, any>
): Promise<{
  success?: boolean;
  data?: any;
  calendarError?: string | null;
  error?: string;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", jobId)
    .select()
    .single();

  if (error) return { error: error.message };

  // Run Google Calendar sync asynchronously to avoid blocking the UI
  syncAllCalendarEvents(jobId, supabase).catch((err) =>
    console.error("Background calendar sync failed:", err)
  );

  invalidateJobCaches();
  return { success: true, data, calendarError: null };
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

  // Run Google Calendar sync asynchronously to avoid blocking the UI
  Promise.allSettled(eventIds.map((id) => deleteCalendarEvent(id))).catch((err) =>
    console.error("Background calendar sync failed:", err)
  );

  invalidateJobCaches();
  return { success: true };
}

/**
 * Creates a new job or updates an existing one.
 * Handles optional new-customer creation atomically.
 * Syncs all Google Calendar events after the DB write.
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
  calendarError?: string | null;
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

    // Run Google Calendar sync asynchronously to avoid blocking the UI
    syncAllCalendarEvents(fullJob.id, supabase).catch((err) =>
      console.error("Background calendar sync failed:", err)
    );

    invalidateJobCaches();
    return { success: true, savedJob: fullJob, calendarError: null };
  } catch (err: any) {
    return { error: err.message };
  }
}

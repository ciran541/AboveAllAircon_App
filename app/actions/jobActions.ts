"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { upsertCalendarEvent, deleteCalendarEvent } from "@/lib/googleCalendar";

// ── Types ─────────────────────────────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type JobCalendarRow = {
  id: string;
  service_type: string;
  notes: string | null;
  // schedulable dates
  visit_date: string | null;
  visit_time: string | null;
  job_date: string | null;
  job_time: string | null;
  second_visit_date: string | null;
  second_visit_time: string | null;
  // per-event IDs (actual DB column names)
  visit_event_id: string | null;
  job_event_id: string | null;
  second_visit_event_id: string | null;
  // customer join
  customers: { name: string; phone: string | null; address: string | null } | null;
};

// ── Calendar sync helper ──────────────────────────────────────────────────────

/**
 * Reads the current state of a job from the DB and reconciles all three
 * calendar event types (site visit, job, second visit):
 *   - date present  → upsert event, save returned eventId
 *   - date absent   → delete event (if one exists), clear eventId
 *
 * Calendar errors are non-fatal: the function returns them as a string
 * so the caller can surface a soft warning without blocking the UI.
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
    return { calendarError: fetchError?.message || "Unable to fetch job for calendar sync." };
  }

  // Supabase join can return array — normalise to single object
  const jobData = job as any;
  const customers = Array.isArray(jobData.customers) ? jobData.customers[0] : jobData.customers;
  const jobBase = { id: jobData.id, service_type: jobData.service_type, notes: jobData.notes, customers };

  const schedule = [
    {
      type: "site_visit"   as const,
      date: (job as any).visit_date        as string | null,
      time: (job as any).visit_time        as string | null,
      existingId: (job as any).visit_event_id as string | null,
      col: "visit_event_id",
    },
    {
      type: "job"          as const,
      date: (job as any).job_date          as string | null,
      time: (job as any).job_time          as string | null,
      existingId: (job as any).job_event_id   as string | null,
      col: "job_event_id",
    },
    {
      type: "second_visit" as const,
      date: (job as any).second_visit_date as string | null,
      time: (job as any).second_visit_time as string | null,
      existingId: (job as any).second_visit_event_id as string | null,
      col: "second_visit_event_id",
    },
  ];

  const errors: string[] = [];

  for (const s of schedule) {
    try {
      if (s.date) {
        // Upsert the event (create or update)
        const { eventId } = await upsertCalendarEvent({
          type: s.type,
          job: jobBase,
          date: s.date,
          time: s.time ?? null,
          existingEventId: s.existingId,
        });
        // Persist the (possibly new) event ID
        await supabase.from("jobs").update({ [s.col]: eventId }).eq("id", jobId);
      } else if (s.existingId) {
        // Date cleared — delete the event and clear the stored ID
        await deleteCalendarEvent(s.existingId);
        await supabase.from("jobs").update({ [s.col]: null }).eq("id", jobId);
      }
      // If no date and no existingId — nothing to do
    } catch (err: any) {
      errors.push(`[${s.type}] ${err.message}`);
    }
  }

  return errors.length > 0 ? { calendarError: errors.join(" | ") } : {};
}

// ── Exported actions ──────────────────────────────────────────────────────────

/**
 * Called by the Kanban board when dragging a card to a new stage.
 * Saves the stage + any extra field updates, then syncs all calendar events.
 */
export async function updateJobStage(jobId: string, newStage: string, updates: any) {
  const supabase = await createClient();
  const dbStage = newStage === "First Visit" ? "In Progress" : newStage;

  const { error } = await supabase
    .from("jobs")
    .update({ stage: dbStage, ...updates })
    .eq("id", jobId);

  if (error) return { error: error.message };

  const { calendarError } = await syncAllCalendarEvents(jobId, supabase);
  revalidatePath("/dashboard/jobs");
  return { success: true, calendarError: calendarError ?? null };
}

/**
 * Called by the Job Detail page for stage advances and field edits.
 * Saves arbitrary field updates (no stage logic), then syncs all calendar events.
 */
export async function updateJobFields(jobId: string, updates: Record<string, any>) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", jobId)
    .select()
    .single();

  if (error) return { error: error.message };

  const { calendarError } = await syncAllCalendarEvents(jobId, supabase);
  revalidatePath("/dashboard/jobs");
  return { success: true, data, calendarError: calendarError ?? null };
}

/**
 * Deletes a job and all its associated Google Calendar events.
 */
export async function deleteJob(jobId: string) {
  const supabase = await createClient();

  const { data: job, error: fetchError } = await supabase
    .from("jobs")
    .select("visit_event_id, job_event_id, second_visit_event_id")
    .eq("id", jobId)
    .single();

  if (fetchError) return { error: fetchError.message };

  // Delete all calendar events — ignore individual failures
  const eventIds = [
    (job as any)?.visit_event_id,
    (job as any)?.job_event_id,
    (job as any)?.second_visit_event_id,
  ].filter(Boolean) as string[];

  await Promise.allSettled(eventIds.map((id) => deleteCalendarEvent(id)));

  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/jobs");
  return { success: true };
}

/**
 * Creates a new job or updates an existing one (used by JobModal).
 * Syncs all calendar events after save.
 */
export async function saveJob(dataToSave: any, newCustomerData?: any) {
  const supabase = await createClient();

  try {
    let finalCustomerId = dataToSave.customer_id;

    if (newCustomerData) {
      const { data: newCustData, error: custErr } = await supabase
        .from("customers")
        .insert([{
          name: newCustomerData.name,
          phone: newCustomerData.phone || null,
          address: newCustomerData.address || null,
          unit_type: newCustomerData.unit_type || null,
        }])
        .select()
        .single();

      if (custErr) return { error: custErr.message };
      finalCustomerId = newCustData.id;
    }

    const payload = { ...dataToSave, customer_id: finalCustomerId };

    let savedJobId: string;

    if (!payload.id) {
      const { data, error: insertError } = await supabase
        .from("jobs")
        .insert([payload])
        .select("id")
        .single();
      if (insertError) return { error: insertError.message };
      savedJobId = data.id;
    } else {
      const { id, ...updatePayload } = payload;
      const { error: updateError } = await supabase
        .from("jobs")
        .update(updatePayload)
        .eq("id", id);
      if (updateError) return { error: updateError.message };
      savedJobId = id;
    }

    const { calendarError } = await syncAllCalendarEvents(savedJobId, supabase);

    const { data: fullJob } = await supabase
      .from("jobs")
      .select("*, customers(*)")
      .eq("id", savedJobId)
      .single();

    revalidatePath("/dashboard/jobs");
    return { success: true, savedJob: fullJob, calendarError: calendarError ?? null };
  } catch (err: any) {
    return { error: err.message };
  }
}

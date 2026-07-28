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
import {
  batchSyncCalendarEvents,
  listCalendarEvents,
  getCalendarEventStatus,
  expectedEventStart,
  logCalendarEvent,
  type CalendarEventType,
} from "@/lib/googleCalendar";
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

/** The jobs column holding each slot's Google event id. */
const SLOT_EVENT_COLUMN = {
  site_visit: "visit_event_id",
  job: "job_event_id",
  second_visit: "second_visit_event_id",
} as const;

type SlotRemoval = {
  job_id: string;
  event_type: CalendarEventType;
  event_id: string | null;
  slot_date: string | null;
  detected_at: string;
  resolution: string | null;
};

/**
 * Slots whose Calendar event a person deleted by hand (see migration
 * 20260728120000_add_calendar_slot_removals.sql), keyed `${jobId}:${type}`.
 */
async function fetchSlotRemovals(
  admin: AdminClient,
  jobIds?: string[]
): Promise<Map<string, SlotRemoval>> {
  let query = admin.from("calendar_slot_removals").select("*");
  if (jobIds) {
    if (jobIds.length === 0) return new Map();
    query = query.in("job_id", jobIds);
  }
  const { data, error } = await query;
  // Failing loudly matters here: treating an unreadable removals table as "no
  // removals" would let every suppressed slot be recreated as a zombie event.
  if (error) throw new Error(`Unable to read calendar_slot_removals: ${error.message}`);
  return new Map(
    ((data as SlotRemoval[]) ?? []).map((r) => [`${r.job_id}:${r.event_type}`, r])
  );
}

/**
 * A removal only applies to the date it was recorded against. Rescheduling the
 * slot in the app is a fresh statement that it *should* be on the calendar, so
 * the old removal is discarded rather than suppressing the new date forever.
 */
function removalApplies(removal: SlotRemoval | undefined, date: string | null): boolean {
  return Boolean(removal && date && removal.slot_date === date);
}

/**
 * Reconciles all three calendar event types (site visit, job, second visit)
 * for a job: date present → upsert, date absent → delete stale event.
 *
 * Slots a person deleted directly in Calendar are left alone: recreating them
 * on the next save is exactly the zombie-event behaviour this app refuses to
 * do. They stay off until someone resolves the removal on the logs page.
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

  const removals = await fetchSlotRemovals(admin, [jobId]);
  const suppressed = new Set<CalendarEventType>();
  const stale: CalendarEventType[] = [];
  for (const slot of schedule) {
    const removal = removals.get(`${jobId}:${slot.type}`);
    if (!removal) continue;
    if (removalApplies(removal, slot.date)) suppressed.add(slot.type);
    else stale.push(slot.type);
  }
  // Rescheduled or cleared since the removal was recorded — it no longer speaks
  // for this slot, so drop it and let the slot sync normally again.
  if (stale.length > 0) {
    await admin.from("calendar_slot_removals").delete().eq("job_id", jobId).in("event_type", stale);
  }

  const upserts = schedule
    .filter((s) => s.date && !suppressed.has(s.type))
    .map((s) => ({ type: s.type, job: jobBase, date: s.date as string, time: s.time ?? null, existingEventId: s.existingId, col: s.col }));

  const deletes = schedule
    .filter((s) => !s.date && s.existingId)
    .map((s) => ({ eventId: s.existingId as string, col: s.col, jobId, type: s.type }));

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

/**
 * Processes a single claimed sync_queue row and writes back its outcome.
 * Completion goes through the complete_sync_row RPC rather than a plain
 * update: it also detects work enqueued while this run was in flight and
 * re-queues instead of falsely marking success (see migration
 * 20260729000000_fix_sync_queue_lost_updates.sql).
 */
export async function processQueueRow(
  admin: AdminClient,
  row: SyncQueueRow
): Promise<{ requeuedForNewerData: boolean }> {
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

    const { data: status } = await admin.rpc("complete_sync_row", { p_id: row.id });
    // The run itself succeeded but the RPC kept the row pending — that means a
    // newer save landed mid-flight and still needs syncing.
    return { requeuedForNewerData: status === "pending" };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    await admin.rpc("complete_sync_row", {
      p_id: row.id,
      p_error: message,
      p_backoff_minutes: backoffMinutes(row.attempts),
      p_out_of_attempts: row.attempts >= row.max_attempts,
    });
    // Failures wait out their backoff; re-running now would just burn attempts.
    return { requeuedForNewerData: false };
  }
}

/**
 * Claims and processes all currently-due sync_queue rows for one job.
 * Scheduled via after() right after a job mutation's response is sent —
 * runs in the background without adding external-API latency to the save.
 */
export async function processJobQueue(jobId: string): Promise<void> {
  const admin = createAdminClient();

  // Loop so that a save landing mid-flight gets synced in this same pass
  // instead of waiting for the next save or the daily cron. Bounded because
  // a steady stream of edits could otherwise keep this alive indefinitely —
  // whatever is left over is picked up by the next trigger either way.
  for (let pass = 0; pass < 3; pass++) {
    const { data: claimed, error } = await admin.rpc("claim_sync_queue_batch", {
      p_limit: 10,
      p_stale_after: "10 minutes",
      p_job_id: jobId,
    });
    if (error || !claimed || (claimed as SyncQueueRow[]).length === 0) return;

    const results = await Promise.allSettled(
      (claimed as SyncQueueRow[]).map((row) => processQueueRow(admin, row))
    );
    const needsAnotherPass = results.some(
      (r) => r.status === "fulfilled" && r.value.requeuedForNewerData
    );
    if (!needsAnotherPass) return;
  }
}

/**
 * Claims this job's due rows, processes the calendar one inline and returns
 * its outcome, and hands back the remaining work (Sheets / Meta-lead) as a
 * promise for the caller to run in the background.
 *
 * The split exists so a save that changed a date can wait for *calendar*
 * confirmation — the thing the user actually cares about — without also
 * waiting on an Apps Script webhook that nobody needs synchronously.
 */
export async function syncCalendarNow(jobId: string): Promise<{
  calendarError?: string;
  background: Promise<unknown>;
}> {
  const admin = createAdminClient();
  const { data: claimed, error } = await admin.rpc("claim_sync_queue_batch", {
    p_limit: 10,
    p_stale_after: "10 minutes",
    p_job_id: jobId,
  });
  if (error) return { background: Promise.resolve() };

  const rows = (claimed ?? []) as SyncQueueRow[];
  const calendarRow = rows.find((r) => r.integration === "calendar");
  const rest = rows.filter((r) => r.integration !== "calendar");

  // Claimed rows must be processed or they sit in 'processing' until they go
  // stale, so the non-calendar ones are handed back rather than dropped.
  const background = Promise.allSettled(rest.map((r) => processQueueRow(admin, r)));

  if (!calendarRow) return { background };

  await processQueueRow(admin, calendarRow);
  const { data: finalRow } = await admin
    .from("sync_queue")
    .select("last_error")
    .eq("id", calendarRow.id)
    .maybeSingle();

  return { calendarError: finalRow?.last_error ?? undefined, background };
}

/** What's wrong with one job slot, from Google's point of view. */
export type SlotState = "no_event_id" | "missing" | "cancelled" | "time_mismatch" | "removed";

export type ReconciliationIssue = {
  jobId: string;
  customerName: string | null;
  eventType: "site_visit" | "job" | "second_visit";
  state: SlotState;
  eventId: string | null;
  expectedStart: string | null;
  actualStart: string | null;
};

/**
 * States where the event is unambiguously broken, so healing is safe.
 *
 * Only `no_event_id` qualifies: it means the app never created the event, so
 * there is no human action to contradict. `missing` and `cancelled` both mean
 * somebody deleted something, and Google's tombstone records no intent — those
 * become `removed` and wait for a person.
 */
const AUTO_HEAL_STATES: SlotState[] = ["no_event_id"];

/** Deletions done outside the app, which the app must not silently undo. */
const DELETED_STATES: SlotState[] = ["missing", "cancelled"];

/**
 * Compares what the app believes about every scheduled job against what
 * Google Calendar actually holds — the difference between "our API call
 * returned 200" and "the event is really there, on the right day".
 *
 * Driven from job *slots that have a date*, not from stored event ids: a slot
 * with a date and no event id means the job isn't on the calendar at all,
 * which is the single most important case and the one an id-driven check
 * structurally cannot see.
 *
 * Healing policy (deliberate): only slots the app never put on the calendar
 * are repaired automatically. Anything a person did directly in Calendar is
 * reported, never overwritten — dragging an event to a new time is a
 * legitimate reschedule, and deleting one is a legitimate cancellation. Undoing
 * either would be the same class of bug as resetting a manually changed colour,
 * except worse: a recreated event gets deleted and recreated forever.
 *
 * A deletion is recorded (calendar_slot_removals), the dead event id is cleared
 * so nothing retries it, and the slot waits for a decision on the logs page.
 */
export async function reconcileCalendar(
  admin: AdminClient,
  opts: { heal?: boolean } = {}
): Promise<{ checked: number; issues: ReconciliationIssue[]; healed: number }> {
  // Only look at jobs scheduled from ~60 days ago onward. Drift on long-past
  // jobs has no operational value, and bounding the window keeps both the
  // Calendar listing and this query small enough to finish well inside the
  // route's maxDuration.
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 60);
  const windowStartDate = windowStart.toISOString().slice(0, 10);

  const { data: jobs } = await admin
    .from("jobs")
    .select(
      "id, visit_date, visit_time, visit_event_id, job_date, job_time, job_event_id, " +
        "second_visit_date, second_visit_time, second_visit_event_id, customers(name)"
    )
    .or(
      `visit_date.gte.${windowStartDate},job_date.gte.${windowStartDate},second_visit_date.gte.${windowStartDate}`
    );

  const [listed, removals] = await Promise.all([
    listCalendarEvents(windowStart.toISOString()),
    fetchSlotRemovals(admin),
  ]);

  let checked = 0;
  const issues: ReconciliationIssue[] = [];
  const jobsToHeal = new Set<string>();

  for (const job of (jobs as any[]) ?? []) {
    const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;
    const slots = [
      { date: job.visit_date, time: job.visit_time, eventId: job.visit_event_id, type: "site_visit" as const },
      { date: job.job_date, time: job.job_time, eventId: job.job_event_id, type: "job" as const },
      { date: job.second_visit_date, time: job.second_visit_time, eventId: job.second_visit_event_id, type: "second_visit" as const },
    ];

    for (const slot of slots) {
      if (!slot.date || slot.date < windowStartDate) continue;
      checked++;

      const expectedStart = expectedEventStart(slot.date, slot.time ?? null);

      // Already known to have been deleted by hand. Decided removals are
      // silent; undecided ones surface as a question, and neither re-checks
      // Google — the event id is gone, there is nothing left to look up.
      const removal = removals.get(`${job.id}:${slot.type}`);
      if (removalApplies(removal, slot.date)) {
        if (removal!.resolution === "kept_off") continue;
        issues.push({
          jobId: job.id,
          customerName: customer?.name ?? null,
          eventType: slot.type,
          state: "removed",
          eventId: removal!.event_id,
          expectedStart,
          actualStart: null,
        });
        continue;
      }

      let state: SlotState | null = null;
      let actualStart: string | null = null;

      if (!slot.eventId) {
        state = "no_event_id";
      } else {
        let event = listed.get(slot.eventId);
        if (!event) {
          // Absent from the listing isn't proof of anything: it may have been
          // purged, or moved outside the window. Confirm directly before
          // deciding. Rare, so the extra call is cheap.
          try {
            const status = await getCalendarEventStatus(slot.eventId);
            if (status === null) state = "missing";
            else if (status === "cancelled") state = "cancelled";
          } catch {
            continue; // transient API error — next run re-checks
          }
        } else if (event.status === "cancelled") {
          state = "cancelled";
        } else {
          actualStart = event.startDateTime ?? event.startDate ?? null;
          // Compare instants, never strings — Google normalizes UTC offsets,
          // so "+08:00" can come back as a different but equivalent spelling.
          const expectedMs = Date.parse(expectedStart);
          const actualMs = event.startDateTime ? Date.parse(event.startDateTime) : NaN;
          if (!event.startDateTime || Number.isNaN(actualMs) || actualMs !== expectedMs) {
            state = "time_mismatch";
          }
        }
      }

      if (!state) continue;

      // First sighting of a hand-deleted event. Record it, clear the dead id so
      // no save or heal ever PATCHes it again (Google answers 200 with a
      // stripped tombstone for these, so neither the 404/410 recreate path nor
      // a status check can tell it apart from a live event), and ask a human.
      if (DELETED_STATES.includes(state)) {
        const { error: removalError } = await admin.from("calendar_slot_removals").upsert(
          {
            job_id: job.id,
            event_type: slot.type,
            event_id: slot.eventId,
            slot_date: slot.date,
            detected_at: new Date().toISOString(),
            resolution: null,
            resolved_at: null,
          },
          { onConflict: "job_id,event_type" }
        );
        // Order matters: clearing the id without a recorded removal turns the
        // slot into `no_event_id`, which *is* auto-healed — the exact zombie
        // this whole path exists to prevent. Leave everything as-is and report.
        if (removalError) {
          issues.push({
            jobId: job.id,
            customerName: customer?.name ?? null,
            eventType: slot.type,
            state,
            eventId: slot.eventId ?? null,
            expectedStart,
            actualStart,
          });
          continue;
        }
        await admin
          .from("jobs")
          .update({ [SLOT_EVENT_COLUMN[slot.type]]: null })
          .eq("id", job.id);
        await logCalendarEvent({
          jobId: job.id,
          eventType: slot.type,
          operation: "drift_detected",
          eventId: slot.eventId,
          success: true,
          error:
            `Event was deleted in Google Calendar (${state}) by someone outside this app. ` +
            `Left off the calendar pending a decision — not recreated.`,
        });
        issues.push({
          jobId: job.id,
          customerName: customer?.name ?? null,
          eventType: slot.type,
          state: "removed",
          eventId: slot.eventId ?? null,
          expectedStart,
          actualStart,
        });
        continue;
      }

      issues.push({
        jobId: job.id,
        customerName: customer?.name ?? null,
        eventType: slot.type,
        state,
        eventId: slot.eventId ?? null,
        expectedStart,
        actualStart,
      });

      if (AUTO_HEAL_STATES.includes(state)) {
        await logCalendarEvent({
          jobId: job.id,
          eventType: slot.type,
          operation: "drift_detected",
          eventId: slot.eventId,
          success: true,
          error: `Slot is ${state.replace(/_/g, " ")} on Google Calendar; repairing.`,
        });
        jobsToHeal.add(job.id);
      }
    }
  }

  let healed = 0;
  if (opts.heal) {
    // One job at a time — a burst of concurrent Calendar writes across many
    // drifted jobs is exactly what trips Google's short-window rate limit.
    //
    // Heal *through the queue* rather than calling syncCalendarForJob
    // directly, so the sync_queue row reflects the outcome. Healing directly
    // left rows showing a stale last_error long after the calendar was
    // repaired — the "banner says broken but it isn't" confusion.
    for (const jobId of jobsToHeal) {
      try {
        await admin.rpc("enqueue_sync", { p_job_id: jobId, p_integration: "calendar" });
        await processJobQueue(jobId);
        healed++;
      } catch {
        // Already recorded on the queue row and in calendar_event_log; the
        // next run picks it up again.
      }
    }
  }

  return { checked, issues, healed };
}

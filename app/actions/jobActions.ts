"use server";

import * as JobService from "@/app/services/jobService";

/**
 * Called by the Kanban board when dragging a card to a new stage.
 * Delegates entirely to JobService.
 */
export async function updateJobStage(
  jobId: string,
  newStage: string,
  updates: Record<string, any> = {}
) {
  return JobService.transitionStage(jobId, newStage, updates);
}

/**
 * Called by the Job Detail page for stage advances and field edits.
 * Delegates entirely to JobService.
 */
export async function updateJobFields(
  jobId: string,
  updates: Record<string, any>
) {
  return JobService.updateFields(jobId, updates);
}

/**
 * Deletes a job and its calendar events.
 * Delegates entirely to JobService.
 */
export async function deleteJob(jobId: string) {
  return JobService.deleteJob(jobId);
}

/**
 * Re-runs sync for a job/integration pair (e.g. after a previous sync failure).
 * Delegates entirely to JobService.
 */
export async function retrySync(jobId: string, integration: "calendar" | "sheets" | "meta_lead") {
  return JobService.retrySync(jobId, integration);
}

/**
 * Creates a new job or updates an existing one (used by JobModal).
 * Delegates entirely to JobService.
 */
export async function saveJob(dataToSave: any, newCustomerData?: any) {
  return JobService.saveJob(dataToSave, newCustomerData);
}

/**
 * Current calendar sync state for a job. Lets the client confirm the outcome
 * shortly after a save without the save itself having waited for Google.
 */
export async function getJobSyncStatus(jobId: string) {
  return JobService.getJobSyncStatus(jobId);
}

/**
 * Resolves a reconciliation conflict where Google Calendar's start time
 * differs from the app's — someone rescheduled the event directly in
 * Calendar. Delegates entirely to JobService.
 */
export async function resolveCalendarConflict(
  jobId: string,
  eventType: "site_visit" | "job" | "second_visit",
  resolution: "accept_calendar" | "keep_app"
) {
  return JobService.resolveCalendarConflict(jobId, eventType, resolution);
}

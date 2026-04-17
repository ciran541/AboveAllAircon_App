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
 * Creates a new job or updates an existing one (used by JobModal).
 * Delegates entirely to JobService.
 */
export async function saveJob(dataToSave: any, newCustomerData?: any) {
  return JobService.saveJob(dataToSave, newCustomerData);
}

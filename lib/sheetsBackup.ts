/**
 * lib/sheetsBackup.ts
 *
 * Fire-and-forget backup: posts a job snapshot to the Google Apps Script
 * Web App which writes/updates a row in the "Above_All_Aircon_Backup" sheet.
 *
 * - NEVER throws — all errors are swallowed and logged silently.
 * - NEVER awaited by callers — runs completely in the background.
 * - Has zero impact on response time or DB operations.
 */

import { JOB_STAGES, getStageDisplay } from "@/lib/constants";

const SHEETS_WEBHOOK_URL    = process.env.GOOGLE_SHEETS_BACKUP_URL    ?? "";
const SHEETS_BACKUP_SECRET  = process.env.GOOGLE_SHEETS_BACKUP_SECRET ?? "";

const META_LEADS_WEBHOOK_URL  = process.env.GOOGLE_SHEETS_META_LEADS_URL    ?? "";
const META_LEADS_SECRET       = process.env.GOOGLE_SHEETS_META_LEADS_SECRET ?? "";

// Keep in sync with app/dashboard/analytics/MetaLeadsReport.tsx
// Qualified: lead reached "Site Visit Scheduled" — the first pipeline stage,
// so this covers every lead keyed into the CRM.
const QUALIFIED_FROM = "Site Visit Scheduled";
// Confirmed: lead reached "Job Scheduled" — quote accepted, job booked.
const CONFIRMED_FROM = "Job Scheduled";

/** Maps a raw job DB row (with joined customers) into a flat, ops-friendly payload. */
function buildPayload(job: any): Record<string, string> {
  const customer = Array.isArray(job.customers)
    ? job.customers[0]
    : job.customers;

  // Compute remaining balance
  const quoted = parseFloat(job.quoted_amount ?? job.labor_cost ?? 0) || 0;
  const deposit = parseFloat(job.deposit_amount ?? 0) || 0;
  const cv = parseFloat(job.cv_amount ?? 0) || 0;
  const finalPaid = job.final_payment_collected ? quoted - deposit - cv : 0;
  const remaining = Math.max(0, quoted - deposit - cv - finalPaid);

  return {
    job_id: job.id ?? "",
    customer_name: customer?.name ?? "",
    contact: customer?.phone ?? "",
    address: customer?.address ?? "",
    unit_type: customer?.unit_type ?? "",
    service_type: job.service_type ?? "",
    stage: job.stage ?? "",
    ac_brand: job.ac_brand ?? "",
    unit_count: String(job.unit_count ?? ""),
    visit_date: job.visit_date ?? "",
    visit_time: job.visit_time ?? "",
    job_date: job.job_date ?? "",
    job_time: job.job_time ?? "",
    second_visit_date: job.second_visit_date ?? "",
    second_visit_time: job.second_visit_time ?? "",
    quoted_amount: String(quoted),
    deposit_amount: String(deposit),
    deposit_collected: job.deposit_collected ? "Yes" : "No",
    cv_redeemed: job.cv_redeemed ? "Yes" : "No",
    cv_amount: String(cv),
    final_payment_collected: job.final_payment_collected ? "Yes" : "No",
    remaining_balance: String(remaining),
    payment_status: job.payment_status ?? "",
    engineer_name: job.engineer_name ?? "",
    notes: job.notes ?? "",
    created_at: job.created_at ?? "",
    last_synced: new Date().toISOString(),
  };
}

/**
 * Call this AFTER a successful DB write.
 * Usage: logJobToSheets(savedJob)   ← no await, no try/catch needed by caller
 */
export function logJobToSheets(job: any): void {
  if (!SHEETS_WEBHOOK_URL) {
    // Env var not set — silently skip (e.g. in local dev without the URL)
    return;
  }

  const payload = buildPayload(job);

  // Fire and forget — intentionally not awaited
  fetch(SHEETS_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: SHEETS_BACKUP_SECRET, ...payload }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn("[SheetsBackup] Non-OK response:", res.status, text);
      }
    })
    .catch((err) => {
      console.warn("[SheetsBackup] Failed to log job:", err?.message ?? err);
    });
}

/**
 * Call this AFTER a successful DB write, alongside logJobToSheets.
 * Pushes only Meta-sourced leads to a separate sheet the ad agency can
 * access, so they can see lead volume / qualification / conversion and
 * optimize their campaigns. No-op for jobs from any other source.
 *
 * Usage: logMetaLeadToSheets(savedJob)   ← no await, no try/catch needed by caller
 */
export function logMetaLeadToSheets(job: any): void {
  if (!META_LEADS_WEBHOOK_URL || job?.source !== "Meta") return;

  const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;

  const stageIdx = JOB_STAGES.indexOf(getStageDisplay(job.stage ?? "") as any);

  const payload = {
    job_id: job.id ?? "",
    customer_name: customer?.name ?? "",
    contact: customer?.phone ?? "",
    stage: job.stage ?? "",
    qualified: stageIdx >= JOB_STAGES.indexOf(QUALIFIED_FROM) ? "Yes" : "No",
    confirmed: stageIdx >= JOB_STAGES.indexOf(CONFIRMED_FROM) ? "Yes" : "No",
    created_at: job.created_at ?? "",
    last_synced: new Date().toISOString(),
  };

  // Fire and forget — intentionally not awaited
  fetch(META_LEADS_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: META_LEADS_SECRET, ...payload }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn("[SheetsBackup] Meta lead — non-OK response:", res.status, text);
      }
    })
    .catch((err) => {
      console.warn("[SheetsBackup] Failed to log Meta lead:", err?.message ?? err);
    });
}

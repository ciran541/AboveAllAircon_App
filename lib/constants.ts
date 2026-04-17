/**
 * lib/constants.ts
 *
 * Single source of truth for all domain enums and lookup tables.
 * Import from here — never hardcode these values in components or actions.
 */

// ── Job Stages ────────────────────────────────────────────────────────────────

/**
 * The canonical ordered list of job pipeline stages.
 * The DB stores "In Progress" for what the UI shows as "First Visit".
 */
export const JOB_STAGES = [
  "Site Visit Scheduled",
  "Quotation Sent",
  "Job Scheduled",
  "First Visit",
  "Second Visit",
  "Job Done (Payment Pending)",
  "Completed",
] as const;

export type JobStage = (typeof JOB_STAGES)[number];

/**
 * Maps DB-stored values → UI display labels.
 * Only include entries where the DB value differs from the UI label.
 */
export const STAGE_DISPLAY: Record<string, string> = {
  "In Progress": "First Visit",
};

/**
 * Maps UI display labels back → DB-stored values.
 * Only include entries where the UI label differs from the DB value.
 */
export const STAGE_DB_MAPPING: Record<string, string> = {
  "First Visit": "In Progress",
};

/** Converts a raw DB stage value to the UI display label. */
export const getStageDisplay = (stage: string): string =>
  STAGE_DISPLAY[stage] ?? stage;

/** Converts a UI display label to the DB-safe value. */
export const getStageDB = (stage: string): string =>
  STAGE_DB_MAPPING[stage] ?? stage;

// ── Customer ─────────────────────────────────────────────────────────────────

export const UNIT_TYPES = [
  "BTO",
  "Resale",
  "Condo",
  "Landed",
  "Commercial",
] as const;

export type UnitType = (typeof UNIT_TYPES)[number];

// ── Payment ───────────────────────────────────────────────────────────────────

export const PAYMENT_STATUSES = ["Pending", "Paid"] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * lib/activityLabels.ts
 *
 * Turns raw column names and stored values into something readable in the
 * job timeline. Discipline lives here rather than in the table: job_activity
 * records every changed column, and the renderer decides what's worth showing
 * by name and what collapses into "and N other fields".
 */

/** Columns worth naming in the timeline. Anything else is summarised. */
export const FIELD_LABELS: Record<string, string> = {
  stage: "Stage",
  visit_date: "Site visit date",
  visit_time: "Site visit time",
  job_date: "Installation date",
  job_time: "Installation time",
  second_visit_date: "Second visit date",
  second_visit_time: "Second visit time",
  notes: "Notes",
  service_type: "Service type",
  ac_brand: "AC brand",
  unit_count: "Number of units",
  quoted_amount: "Quoted amount",
  deposit_collected: "Deposit collected",
  final_payment_collected: "Final payment collected",
  cv_redeemed: "Climate voucher redeemed",
  cv_amount: "Climate voucher amount",
  payment_status: "Payment status",
  priority: "Priority",
  source: "Lead source",
  assigned_to: "Assigned to",
  engineer_name: "Engineer",
  service_report_no: "Service report no.",
  internal_notes: "Internal notes",
  status: "Status",
  loss_reason: "Loss reason",
};

const MONEY_FIELDS = new Set([
  "quoted_amount",
  "deposit_collected",
  "final_payment_collected",
  "cv_amount",
  "labor_cost",
  "material_cost",
  "deposit_amount",
]);

/** Renders a stored value for display; long text is truncated, not dumped. */
export function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "empty";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (MONEY_FIELDS.has(field)) {
    const n = Number(value);
    if (!Number.isNaN(n)) return `$${n.toFixed(2)}`;
  }
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, " ");
}

/** Whether this field gets its own line, vs. being counted in the summary. */
export function isNamedField(field: string): boolean {
  return field in FIELD_LABELS;
}

export const CALENDAR_SLOT_LABELS: Record<string, string> = {
  site_visit: "Site visit",
  job: "Installation",
  second_visit: "Second visit",
};

export const CALENDAR_OP_LABELS: Record<string, string> = {
  create: "Calendar event created",
  update: "Calendar event updated",
  delete: "Calendar event deleted",
  drift_detected: "Calendar drift detected",
};

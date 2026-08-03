/**
 * lib/attention.ts
 *
 * The four things that quietly cost this business money: nobody assigned to a
 * booked appointment, a job whose date passed without its stage moving, money
 * that was earned but never collected, and a quotation going cold.
 *
 * All four are derived here in TypeScript rather than in SQL, on purpose.
 * Every rule keys off the stage names in lib/constants.ts, and a stage rename
 * that misses a Postgres function fails silently — the old dashboard RPC
 * (get_admin_dashboard_metrics) still filters on "New Enquiry", a stage that
 * has not existed since migration 20260413000000.
 */

import type { AppointmentJob, AppointmentType } from "@/lib/appointments";
import { diffDays, expandJobToAppointments, resolveAssignee } from "@/lib/appointments";

// ── Stage groupings ───────────────────────────────────────────────────────────

/** DB stage values. "In Progress" is what the UI calls "First Visit". */
const STAGE_SITE_VISIT = "Site Visit Scheduled";
const STAGE_QUOTATION_SENT = "Quotation Sent";
const STAGE_JOB_SCHEDULED = "Job Scheduled";
const STAGE_IN_PROGRESS = "In Progress";
const STAGE_SECOND_VISIT = "Second Visit";
const STAGE_PAYMENT_PENDING = "Job Done (Payment Pending)";
const STAGE_COMPLETED = "Completed";

/** A slot is only "late" if its stage says the work still has not happened. */
const STAGE_AWAITING_SLOT: Record<AppointmentType, string[]> = {
  site_visit: [STAGE_SITE_VISIT],
  job: [STAGE_JOB_SCHEDULED, STAGE_IN_PROGRESS],
  second_visit: [STAGE_SECOND_VISIT],
};

/** Days before expiry at which a quotation becomes worth chasing. */
const QUOTE_EXPIRY_WARNING_DAYS = 3;
/** Days after which an expiry-less quotation counts as having gone quiet. */
const QUOTE_SILENCE_DAYS = 7;
/** How far ahead the unassigned check looks. */
export const UNASSIGNED_HORIZON_DAYS = 7;

// ── Shapes ────────────────────────────────────────────────────────────────────

export interface AttentionJob extends AppointmentJob {
  quoted_amount?: number | null;
  deposit_amount?: number | null;
  deposit_collected?: number | null;
  final_payment_collected?: number | null;
  payment_status?: string | null;
  quoted_date?: string | null;
  expiry_date?: string | null;
  closed_at?: string | null;
  created_at?: string | null;
}

export interface AttentionItem {
  /** Unique within its list — a job can be late on more than one slot. */
  key: string;
  jobId: string;
  customerName: string;
  stage: string;
  serviceType: string | null;
  /** Resolved display name of whoever is on it, or null. */
  assignee: string | null;
  /** The date the item hangs off — the slot date, expiry date, or closing date. */
  date: string | null;
  /** Days late / days outstanding / days until expiry, depending on the list. */
  days: number;
  /** Money still to collect, for the receivables list. */
  amount?: number;
  /** Short human phrase explaining why this is here. */
  detail: string;
  slotType?: AppointmentType;
  /** Severity, used to colour the row. */
  severity: "warning" | "danger";
}

export interface AttentionLists {
  unassigned: AttentionItem[];
  stalled: AttentionItem[];
  unpaid: AttentionItem[];
  quotes: AttentionItem[];
  /** Total money still to collect across the `unpaid` list. */
  outstandingTotal: number;
  /** Combined length of the four lists. */
  total: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isOpen(job: AttentionJob): boolean {
  return !job.status || job.status === "open";
}

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function customerNameOf(job: AttentionJob): string {
  const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;
  return customer?.name?.trim() || "Unknown customer";
}

function dayPhrase(days: number, suffix: string): string {
  if (days <= 0) return `Due today`;
  return `${days} day${days === 1 ? "" : "s"} ${suffix}`;
}

/** Money earned on a job but not yet in the bank. Never negative. */
export function outstandingAmount(job: AttentionJob): number {
  const owed =
    num(job.quoted_amount) - num(job.deposit_collected) - num(job.final_payment_collected);
  return owed > 0 ? Math.round(owed * 100) / 100 : 0;
}

// ── Rules ─────────────────────────────────────────────────────────────────────

/**
 * Booked work with nobody assigned to it, inside the next week. The single
 * most expensive miss: the customer is expecting someone and no one is coming.
 */
function findUnassigned(
  jobs: AttentionJob[],
  today: string,
  staffNames?: Map<string, string>
): AttentionItem[] {
  const horizon = UNASSIGNED_HORIZON_DAYS;
  const items: AttentionItem[] = [];

  for (const job of jobs) {
    if (!isOpen(job) || job.stage === STAGE_COMPLETED) continue;
    // engineer_name, not assigned_to — see resolveAssignee().
    if (resolveAssignee(job, staffNames)) continue;

    for (const appointment of expandJobToAppointments(job, staffNames)) {
      const days = diffDays(today, appointment.date);
      if (days < 0 || days > horizon) continue;
      items.push({
        key: appointment.id,
        jobId: job.id,
        customerName: appointment.customerName,
        stage: job.stage,
        serviceType: appointment.serviceType,
        assignee: null,
        date: appointment.date,
        days,
        detail:
          days === 0 ? "Scheduled today, nobody assigned" : `In ${days} day${days === 1 ? "" : "s"}, nobody assigned`,
        slotType: appointment.type,
        // Today and tomorrow are already a problem; later in the week is a warning.
        severity: days <= 1 ? "danger" : "warning",
      });
    }
  }

  return items.sort((a, b) => a.days - b.days);
}

/**
 * A slot date that has passed while the stage stayed put — i.e. the visit
 * happened but nobody updated the job, or it never happened at all. Either
 * way the pipeline is lying about where the work is.
 */
function findStalled(
  jobs: AttentionJob[],
  today: string,
  staffNames?: Map<string, string>
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const job of jobs) {
    if (!isOpen(job) || job.stage === STAGE_COMPLETED) continue;

    for (const appointment of expandJobToAppointments(job, staffNames)) {
      if (!STAGE_AWAITING_SLOT[appointment.type].includes(job.stage)) continue;
      const daysLate = diffDays(appointment.date, today);
      if (daysLate <= 0) continue;

      items.push({
        key: appointment.id,
        jobId: job.id,
        customerName: appointment.customerName,
        stage: job.stage,
        serviceType: appointment.serviceType,
        assignee: appointment.assignee,
        date: appointment.date,
        days: daysLate,
        detail: `${dayPhrase(daysLate, "past its date")}, still at this stage`,
        slotType: appointment.type,
        severity: daysLate >= 3 ? "danger" : "warning",
      });
    }
  }

  return items.sort((a, b) => b.days - a.days);
}

/**
 * Work that is done (or good as done) with money still outstanding, plus
 * deposits that were agreed but never actually taken.
 */
function findUnpaid(
  jobs: AttentionJob[],
  today: string,
  staffNames?: Map<string, string>
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const job of jobs) {
    const isPaymentPending =
      job.stage === STAGE_PAYMENT_PENDING ||
      (job.stage === STAGE_COMPLETED && job.payment_status === "Pending");

    if (isPaymentPending) {
      const amount = outstandingAmount(job);
      // A job can sit in the payment-pending stage with the money already in —
      // list it only while something is genuinely owed.
      if (amount > 0) {
        const since = job.closed_at?.slice(0, 10) || job.job_date || job.created_at?.slice(0, 10) || today;
        const days = Math.max(0, diffDays(since, today));
        items.push({
          key: `${job.id}:unpaid`,
          jobId: job.id,
          customerName: customerNameOf(job),
          stage: job.stage,
          serviceType: job.service_type ?? null,
          assignee: resolveAssignee(job, staffNames),
          date: since,
          days,
          amount,
          detail: days > 0 ? dayPhrase(days, "outstanding") : "Outstanding since today",
          severity: days >= 14 ? "danger" : "warning",
        });
      }
      continue;
    }

    // Deposit agreed but not collected, on work that is under way.
    const depositGap = num(job.deposit_amount) - num(job.deposit_collected);
    const isActive =
      isOpen(job) &&
      [STAGE_JOB_SCHEDULED, STAGE_IN_PROGRESS, STAGE_SECOND_VISIT].includes(job.stage);

    if (isActive && depositGap > 0) {
      const since = job.job_date || job.created_at?.slice(0, 10) || today;
      items.push({
        key: `${job.id}:deposit`,
        jobId: job.id,
        customerName: customerNameOf(job),
        stage: job.stage,
        serviceType: job.service_type ?? null,
        assignee: resolveAssignee(job, staffNames),
        date: since,
        days: Math.max(0, diffDays(since, today)),
        amount: Math.round(depositGap * 100) / 100,
        detail: "Deposit agreed but not collected",
        severity: "warning",
      });
    }
  }

  return items.sort((a, b) => b.days - a.days || (b.amount ?? 0) - (a.amount ?? 0));
}

/**
 * Quotations that have expired, are about to, or have simply gone quiet.
 * These are the cheapest wins on the list — the customer already asked.
 */
function findStaleQuotes(
  jobs: AttentionJob[],
  today: string,
  staffNames?: Map<string, string>
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const job of jobs) {
    if (job.stage !== STAGE_QUOTATION_SENT || !isOpen(job)) continue;

    const expiry = job.expiry_date?.slice(0, 10) || null;
    const quoted = job.quoted_date?.slice(0, 10) || job.created_at?.slice(0, 10) || null;

    let detail: string | null = null;
    let days = 0;
    let severity: AttentionItem["severity"] = "warning";
    let date = expiry ?? quoted;

    if (expiry) {
      const daysUntilExpiry = diffDays(today, expiry);
      if (daysUntilExpiry < 0) {
        days = -daysUntilExpiry;
        detail = `Expired ${days} day${days === 1 ? "" : "s"} ago`;
        severity = "danger";
      } else if (daysUntilExpiry <= QUOTE_EXPIRY_WARNING_DAYS) {
        days = daysUntilExpiry;
        detail =
          daysUntilExpiry === 0
            ? "Expires today"
            : `Expires in ${days} day${days === 1 ? "" : "s"}`;
      }
    } else if (quoted) {
      const daysSinceQuote = diffDays(quoted, today);
      if (daysSinceQuote >= QUOTE_SILENCE_DAYS) {
        days = daysSinceQuote;
        date = quoted;
        detail = `Sent ${days} days ago, no reply`;
        severity = daysSinceQuote >= QUOTE_SILENCE_DAYS * 2 ? "danger" : "warning";
      }
    }

    if (!detail) continue;

    items.push({
      key: `${job.id}:quote`,
      jobId: job.id,
      customerName: customerNameOf(job),
      stage: job.stage,
      serviceType: job.service_type ?? null,
      assignee: resolveAssignee(job, staffNames),
      date,
      days,
      amount: num(job.quoted_amount) || undefined,
      detail,
      severity,
    });
  }

  // Expired first, then closest to expiring.
  return items.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "danger" ? -1 : 1;
    return b.days - a.days;
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Runs all four rules over one set of jobs. Callers pass every open job plus
 * anything recently closed but unpaid; the rules filter down from there.
 */
export function buildAttentionLists(
  jobs: AttentionJob[],
  today: string,
  staffNames?: Map<string, string>
): AttentionLists {
  const unassigned = findUnassigned(jobs, today, staffNames);
  const stalled = findStalled(jobs, today, staffNames);
  const unpaid = findUnpaid(jobs, today, staffNames);
  const quotes = findStaleQuotes(jobs, today, staffNames);

  return {
    unassigned,
    stalled,
    unpaid,
    quotes,
    outstandingTotal: unpaid.reduce((sum, item) => sum + (item.amount ?? 0), 0),
    total: unassigned.length + stalled.length + unpaid.length + quotes.length,
  };
}

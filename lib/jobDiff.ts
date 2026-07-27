/**
 * lib/jobDiff.ts
 *
 * Field-level diffing for job updates. Two consumers:
 *   1. Deciding whether a save actually needs a Google Calendar sync. Previously
 *      every save re-pushed all three events, so editing the notes on a
 *      completed job produced calendar traffic and log noise for no reason.
 *   2. Recording what a human actually changed (Phase 2 job activity log).
 *
 * Normalization matters more than the comparison here: the date/time columns
 * are `text`, forms submit "" where the DB holds null, and numbers arrive as
 * strings from FormData. A naive !== reports a change on every single save,
 * which would silently defeat the whole point of the gate.
 */

/** Job columns that actually appear in a Calendar event payload. */
export const CALENDAR_JOB_FIELDS = [
  "visit_date",
  "visit_time",
  "job_date",
  "job_time",
  "second_visit_date",
  "second_visit_time",
  "notes",
] as const;

/** Customer columns embedded in a Calendar event's summary/description. */
export const CALENDAR_CUSTOMER_FIELDS = ["name", "phone", "address"] as const;

/**
 * Never diff these. The sync processor writes the *_event_id columns back
 * after every sync — diffing them would make each sync look like a user edit
 * and re-enqueue itself forever.
 */
const IGNORED_FIELDS = new Set([
  "visit_event_id",
  "job_event_id",
  "second_visit_event_id",
  "id",
  "created_at",
  "updated_at",
  "customers",
]);

export type FieldChange = { field: string; from: unknown; to: unknown };

/** "9:00 AM" | "09:00:00" | "9:00" -> "09:00" */
function normalizeTime(value: string): string {
  const ampm = value.match(/^(\d{1,2}):(\d{2})\s*([ap])\.?m\.?$/i);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (ampm[3].toLowerCase() === "p") hour += 12;
    return `${String(hour).padStart(2, "0")}:${ampm[2]}`;
  }
  const hhmm = value.match(/^(\d{1,2}):(\d{2})/);
  if (hhmm) return `${hhmm[1].padStart(2, "0")}:${hhmm[2]}`;
  return value;
}

/** Collapses the many spellings of "no value" and trims incidental formatting. */
function normalize(field: string, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    if (field.endsWith("_time")) return normalizeTime(trimmed);
    return trimmed;
  }
  return value;
}

function valuesEqual(field: string, a: unknown, b: unknown): boolean {
  const na = normalize(field, a);
  const nb = normalize(field, b);
  if (na === nb) return true;
  if (na === null || nb === null) return false;

  // Only coerce when the types genuinely differ — FormData gives "4430" where
  // the DB holds 4430. Coercing unconditionally would make "0912" and "912"
  // compare equal, which for a phone number would be wrong.
  if (typeof na !== typeof nb) {
    const fa = Number(na as any);
    const fb = Number(nb as any);
    if (!Number.isNaN(fa) && !Number.isNaN(fb)) return fa === fb;
    return String(na) === String(nb);
  }
  return false;
}

/**
 * Compares an update payload against the row as it currently stands.
 * Only keys present in `updates` are considered, so this works for both
 * partial edits and full-object saves.
 */
export function diffJob(
  oldRow: Record<string, any> | null | undefined,
  updates: Record<string, any>
): FieldChange[] {
  if (!oldRow) return [];
  const changes: FieldChange[] = [];
  for (const [field, next] of Object.entries(updates)) {
    if (IGNORED_FIELDS.has(field)) continue;
    if (!valuesEqual(field, oldRow[field], next)) {
      changes.push({ field, from: normalize(field, oldRow[field]), to: normalize(field, next) });
    }
  }
  return changes;
}

/** True when any changed field would alter the Google Calendar event. */
export function affectsCalendar(changes: FieldChange[]): boolean {
  return changes.some((c) => (CALENDAR_JOB_FIELDS as readonly string[]).includes(c.field));
}

/** True when a customer edit would alter the events of that customer's jobs. */
export function customerAffectsCalendar(changes: FieldChange[]): boolean {
  return changes.some((c) => (CALENDAR_CUSTOMER_FIELDS as readonly string[]).includes(c.field));
}

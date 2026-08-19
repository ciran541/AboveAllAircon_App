/**
 * lib/bookingRequest.ts
 *
 * Request parsing and validation for the booking API, kept pure so the rules
 * can be unit-tested and so a route handler stays a thin shell around them.
 *
 * The assistant speaks its own vocabulary (`hdb`, `new_installation`) and this
 * app speaks the vocabulary in lib/constants.ts (`Resale`, `Installation`).
 * The mapping between them lives here, in one place, rather than being
 * sprinkled through the routes.
 */

import { SITE_VISIT_SLOTS, slotById } from "@/lib/availability";
import { phoneMatchKey, formatForStorage } from "@/lib/phone";
import { UNIT_TYPES, type UnitType } from "@/lib/constants";

// ── Vocabulary ────────────────────────────────────────────────────────────────

/**
 * What the assistant asks the customer, and what this app stores.
 *
 * `hdb` → `Resale` is the deliberate call: the assistant's four choices have
 * no word for a resale flat, and an HDB flat that isn't a BTO is one. A BTO is
 * asked about separately, so nothing is lost. `Commercial` has no assistant
 * equivalent and is therefore never produced by this API — commercial work
 * arrives by phone and is entered by hand.
 */
export const UNIT_TYPE_MAP: Record<string, UnitType> = {
  hdb: "Resale",
  bto: "BTO",
  condo: "Condo",
  landed: "Landed",
};

/**
 * A replacement is an installation as far as this business is concerned — the
 * work, the engineers and the quotation are the same shape. The distinction
 * survives in internal_notes, where the assistant's summary lands.
 */
export const SERVICE_TYPE_MAP: Record<string, string> = {
  new_installation: "Installation",
  replacement: "Installation",
  servicing: "Servicing",
  repair: "Repair",
};

/** jobs.source values this API is allowed to write. */
export const BOOKING_SOURCES = ["WhatsApp", "Website"] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

/** Every booking lands here — 'New Enquiry' is no longer in jobs_stage_check. */
export const BOOKING_STAGE = "Site Visit Scheduled";

// ── Result plumbing ───────────────────────────────────────────────────────────

export interface FieldError {
  field: string;
  message: string;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldError[] };

function fail<T>(errors: FieldError[]): ParseResult<T> {
  return { ok: false, errors };
}

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Rejects both "not a date" and "2026-02-31", which Date happily rolls over. */
export function isValidISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// ── POST /api/booking/site-visit ──────────────────────────────────────────────

export interface SiteVisitBookingRequest {
  idempotencyKey: string;
  visitDate: string;
  visitTime: string;
  slotLabel: string;
  customer: {
    name: string;
    /** As it will be stored: local 8 digits for SG, E.164 otherwise. */
    phone: string;
    /** Trailing-digit key the RPC matches an existing customer on. */
    phoneMatch: string;
    address: string;
    unitType: UnitType | null;
  };
  job: {
    serviceType: string;
    unitCount: number | null;
    acBrand: string | null;
    visitPhone: string;
    source: BookingSource;
    internalNotes: string | null;
    stage: string;
  };
}

const MAX_NOTES = 4000;

/**
 * Composes what the office will read on the job. The indicative quote is
 * deliberately *text*: quoted_amount drives quotation ageing in lib/attention.ts
 * and the financial reports, and a pre-survey guess written there would age,
 * chase and report as if it were a real quotation.
 */
function composeInternalNotes(
  notes: string | null,
  quote: number | null,
  summary: string | null
): string | null {
  const parts: string[] = [];
  if (quote !== null) {
    parts.push(
      `Indicative quote (pre-survey, not a quotation): SGD ${quote.toFixed(2)}`
    );
  }
  if (summary) parts.push(summary);
  if (notes) parts.push(notes);
  const composed = parts.join("\n\n").trim();
  if (!composed) return null;
  return composed.length > MAX_NOTES ? `${composed.slice(0, MAX_NOTES - 1)}…` : composed;
}

export function parseSiteVisitRequest(body: unknown): ParseResult<SiteVisitBookingRequest> {
  const input = asRecord(body);
  const customerInput = asRecord(input.customer);
  const errors: FieldError[] = [];

  const idempotencyKey = str(input.idempotency_key);
  if (!idempotencyKey) {
    errors.push({ field: "idempotency_key", message: "Required. Send one UUID per booking attempt and reuse it on retries." });
  } else if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    errors.push({ field: "idempotency_key", message: "Must be between 8 and 200 characters." });
  }

  const visitDate = str(input.visit_date);
  if (!visitDate || !isValidISODate(visitDate)) {
    errors.push({ field: "visit_date", message: "Required. Format YYYY-MM-DD." });
  }

  const visitTime = str(input.visit_time);
  const slot = visitTime ? slotById(visitTime) : undefined;
  if (!slot) {
    errors.push({
      field: "visit_time",
      message: `Required. One of: ${SITE_VISIT_SLOTS.map((s) => s.id).join(", ")}.`,
    });
  }

  const name = str(customerInput.name);
  if (!name) errors.push({ field: "customer.name", message: "Required." });
  else if (name.length > 120) errors.push({ field: "customer.name", message: "Must be 120 characters or fewer." });

  const rawPhone = str(customerInput.phone);
  const phoneMatch = rawPhone ? phoneMatchKey(rawPhone) : null;
  const storedPhone = rawPhone ? formatForStorage(rawPhone) : null;
  if (!rawPhone) {
    errors.push({ field: "customer.phone", message: "Required." });
  } else if (!phoneMatch || !storedPhone) {
    errors.push({
      field: "customer.phone",
      message: "Not a recognisable phone number. Singapore numbers may be sent as 91234567, 9123 4567, 6591234567 or +65 9123 4567.",
    });
  }

  const address = str(customerInput.address);
  if (!address) {
    errors.push({ field: "customer.address", message: "Required — the engineer has to be told where to go." });
  } else if (address.length > 500) {
    errors.push({ field: "customer.address", message: "Must be 500 characters or fewer." });
  }

  const rawUnitType = str(customerInput.unit_type);
  let unitType: UnitType | null = null;
  if (rawUnitType) {
    const mapped =
      UNIT_TYPE_MAP[rawUnitType.toLowerCase()] ??
      (UNIT_TYPES as readonly string[]).find((t) => t.toLowerCase() === rawUnitType.toLowerCase());
    if (!mapped) {
      errors.push({
        field: "customer.unit_type",
        message: `One of: ${Object.keys(UNIT_TYPE_MAP).join(", ")}.`,
      });
    } else {
      unitType = mapped as UnitType;
    }
  }

  const rawServiceType = str(input.service_type);
  let serviceType: string | null = null;
  if (!rawServiceType) {
    errors.push({
      field: "service_type",
      message: `Required. One of: ${Object.keys(SERVICE_TYPE_MAP).join(", ")}.`,
    });
  } else {
    const mapped =
      SERVICE_TYPE_MAP[rawServiceType.toLowerCase()] ??
      ["Installation", "Servicing", "Repair"].find(
        (t) => t.toLowerCase() === rawServiceType.toLowerCase()
      );
    if (!mapped) {
      errors.push({
        field: "service_type",
        message: `One of: ${Object.keys(SERVICE_TYPE_MAP).join(", ")}.`,
      });
    } else {
      serviceType = mapped;
    }
  }

  let unitCount: number | null = null;
  if (input.unit_count !== undefined && input.unit_count !== null && input.unit_count !== "") {
    const parsed = Number(input.unit_count);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
      errors.push({ field: "unit_count", message: "Whole number of indoor units, 1 to 20." });
    } else {
      unitCount = parsed;
    }
  }

  const acBrand = str(input.ac_brand);
  if (acBrand && acBrand.length > 80) {
    errors.push({ field: "ac_brand", message: "Must be 80 characters or fewer." });
  }

  const rawSource = str(input.source) ?? "WhatsApp";
  const source = (BOOKING_SOURCES as readonly string[]).find(
    (s) => s.toLowerCase() === rawSource.toLowerCase()
  ) as BookingSource | undefined;
  if (!source) {
    errors.push({ field: "source", message: `One of: ${BOOKING_SOURCES.join(", ")}.` });
  }

  let quote: number | null = null;
  if (input.indicative_quote !== undefined && input.indicative_quote !== null && input.indicative_quote !== "") {
    const parsed = Number(input.indicative_quote);
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.push({ field: "indicative_quote", message: "Must be a non-negative number, in SGD." });
    } else {
      quote = parsed;
    }
  }

  // Loudly refused rather than quietly dropped: a pre-survey figure in
  // quoted_amount would corrupt quotation ageing and the financial reports,
  // and the assistant's author needs to know it was rejected, not ignored.
  if (input.quoted_amount !== undefined) {
    errors.push({
      field: "quoted_amount",
      message: "Not accepted. The site visit precedes the quotation — send indicative_quote instead; it is recorded in internal_notes.",
    });
  }
  if (input.stage !== undefined) {
    errors.push({
      field: "stage",
      message: `Not accepted. Bookings are always created at '${BOOKING_STAGE}'.`,
    });
  }

  const visitPhoneRaw = str(input.visit_phone);
  const visitPhone = visitPhoneRaw ? formatForStorage(visitPhoneRaw) : null;
  if (visitPhoneRaw && !visitPhone) {
    errors.push({ field: "visit_phone", message: "Not a recognisable phone number." });
  }

  if (errors.length > 0) return fail(errors);

  return {
    ok: true,
    value: {
      idempotencyKey: idempotencyKey as string,
      visitDate: visitDate as string,
      visitTime: slot!.id,
      slotLabel: slot!.label,
      customer: {
        name: name as string,
        phone: storedPhone as string,
        phoneMatch: phoneMatch as string,
        address: address as string,
        unitType,
      },
      job: {
        serviceType: serviceType as string,
        unitCount,
        acBrand,
        // The number the customer is actually chatting from is the one worth
        // ringing on the doorstep, so it defaults to their own.
        visitPhone: visitPhone ?? (storedPhone as string),
        source: source as BookingSource,
        internalNotes: composeInternalNotes(
          str(input.internal_notes),
          quote,
          str(input.chat_summary)
        ),
        stage: BOOKING_STAGE,
      },
    },
  };
}

// ── POST /api/booking/reschedule ──────────────────────────────────────────────

export interface RescheduleRequest {
  jobId: string;
  visitDate: string;
  visitTime: string;
  slotLabel: string;
  reason: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRescheduleRequest(body: unknown): ParseResult<RescheduleRequest> {
  const input = asRecord(body);
  const errors: FieldError[] = [];

  const jobId = str(input.job_id);
  if (!jobId || !UUID.test(jobId)) {
    errors.push({ field: "job_id", message: "Required. The job_id returned when the booking was created." });
  }

  const visitDate = str(input.visit_date);
  if (!visitDate || !isValidISODate(visitDate)) {
    errors.push({ field: "visit_date", message: "Required. Format YYYY-MM-DD." });
  }

  const visitTime = str(input.visit_time);
  const slot = visitTime ? slotById(visitTime) : undefined;
  if (!slot) {
    errors.push({
      field: "visit_time",
      message: `Required. One of: ${SITE_VISIT_SLOTS.map((s) => s.id).join(", ")}.`,
    });
  }

  if (errors.length > 0) return fail(errors);

  return {
    ok: true,
    value: {
      jobId: jobId as string,
      visitDate: visitDate as string,
      visitTime: slot!.id,
      slotLabel: slot!.label,
      reason: str(input.reason),
    },
  };
}

// ── POST /api/booking/cancel ──────────────────────────────────────────────────

export interface CancelRequest {
  jobId: string;
  reason: string;
}

export function parseCancelRequest(body: unknown): ParseResult<CancelRequest> {
  const input = asRecord(body);
  const errors: FieldError[] = [];

  const jobId = str(input.job_id);
  if (!jobId || !UUID.test(jobId)) {
    errors.push({ field: "job_id", message: "Required. The job_id returned when the booking was created." });
  }

  const reason = str(input.reason);
  if (reason && reason.length > 200) {
    errors.push({ field: "reason", message: "Must be 200 characters or fewer." });
  }

  if (errors.length > 0) return fail(errors);

  return {
    ok: true,
    value: {
      jobId: jobId as string,
      // Ends up in loss_reason, which is what the analytics page counts a lost
      // job by, so it has to read like something a human chose from a list.
      reason: reason ?? "Cancelled by customer",
    },
  };
}

// ── GET /api/booking/availability ─────────────────────────────────────────────

export interface AvailabilityQuery {
  from: string | null;
  to: string | null;
}

export function parseAvailabilityQuery(params: URLSearchParams): ParseResult<AvailabilityQuery> {
  const errors: FieldError[] = [];
  const from = str(params.get("from"));
  const to = str(params.get("to"));

  if (from && !isValidISODate(from)) {
    errors.push({ field: "from", message: "Format YYYY-MM-DD." });
  }
  if (to && !isValidISODate(to)) {
    errors.push({ field: "to", message: "Format YYYY-MM-DD." });
  }
  if (from && to && isValidISODate(from) && isValidISODate(to) && to < from) {
    errors.push({ field: "to", message: "Must not be earlier than `from`." });
  }

  if (errors.length > 0) return fail(errors);
  return { ok: true, value: { from, to } };
}

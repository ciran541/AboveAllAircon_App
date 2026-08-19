/**
 * lib/bookingRequest.test.ts — the contract the assistant is held to.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAvailabilityQuery,
  parseCancelRequest,
  parseRescheduleRequest,
  parseSiteVisitRequest,
} from "@/lib/bookingRequest";

const VALID = {
  idempotency_key: "b4f1e3a2-0000-4000-8000-000000000001",
  visit_date: "2026-08-21",
  visit_time: "13:00",
  service_type: "new_installation",
  unit_count: 3,
  ac_brand: "Mitsubishi",
  source: "WhatsApp",
  customer: {
    name: "Tan Wei Ming",
    phone: "+65 9123 4567",
    address: "Blk 123 Ang Mo Kio Ave 6 #08-123",
    unit_type: "hdb",
  },
};

function errorsFor(body: unknown): string[] {
  const parsed = parseSiteVisitRequest(body);
  return parsed.ok ? [] : parsed.errors.map((e) => e.field);
}

test("a well-formed booking maps onto the app's own vocabulary", () => {
  const parsed = parseSiteVisitRequest(VALID);
  assert.ok(parsed.ok);

  assert.equal(parsed.value.job.serviceType, "Installation");
  assert.equal(parsed.value.customer.unitType, "Resale"); // hdb, not a BTO
  assert.equal(parsed.value.customer.phone, "91234567");
  assert.equal(parsed.value.customer.phoneMatch, "91234567");
  assert.equal(parsed.value.job.stage, "Site Visit Scheduled");
  assert.equal(parsed.value.slotLabel, "1pm–2pm");
  // The visit contact defaults to the number the customer is chatting from.
  assert.equal(parsed.value.job.visitPhone, "91234567");
});

test("each unit type maps to a value the customers CHECK constraint allows", () => {
  const mapped = (unit_type: string) => {
    const parsed = parseSiteVisitRequest({ ...VALID, customer: { ...VALID.customer, unit_type } });
    assert.ok(parsed.ok, unit_type);
    return parsed.value.customer.unitType;
  };

  assert.equal(mapped("hdb"), "Resale");
  assert.equal(mapped("bto"), "BTO");
  assert.equal(mapped("condo"), "Condo");
  assert.equal(mapped("landed"), "Landed");
  // The app's own spelling is accepted too, so an admin-side caller isn't
  // forced to speak the assistant's dialect.
  assert.equal(mapped("Condo"), "Condo");
  assert.deepEqual(errorsFor({ ...VALID, customer: { ...VALID.customer, unit_type: "hut" } }), [
    "customer.unit_type",
  ]);
});

test("a replacement is booked as an installation", () => {
  const parsed = parseSiteVisitRequest({ ...VALID, service_type: "replacement" });
  assert.ok(parsed.ok);
  assert.equal(parsed.value.job.serviceType, "Installation");
});

test("quoted_amount is refused, loudly", () => {
  // Silently dropping it would leave the assistant's author believing a
  // pre-survey figure had been stored — and if it ever were, it would age and
  // chase as a real quotation in attention.ts.
  assert.deepEqual(errorsFor({ ...VALID, quoted_amount: 2400 }), ["quoted_amount"]);
});

test("an indicative quote goes into internal_notes, marked as not a quotation", () => {
  const parsed = parseSiteVisitRequest({
    ...VALID,
    indicative_quote: 2400,
    chat_summary: "Wants 3 units, System 3, prefers weekday mornings.",
  });
  assert.ok(parsed.ok);

  const notes = parsed.value.job.internalNotes ?? "";
  assert.match(notes, /Indicative quote \(pre-survey, not a quotation\): SGD 2400\.00/);
  assert.match(notes, /Wants 3 units/);
});

test("missing essentials are all reported at once", () => {
  assert.deepEqual(errorsFor({}).sort(), [
    "customer.address",
    "customer.name",
    "customer.phone",
    "idempotency_key",
    "service_type",
    "visit_date",
    "visit_time",
  ]);
});

test("only real slot ids are accepted", () => {
  // On the hour, inside 10:00-19:00, or not at all.
  assert.deepEqual(errorsFor({ ...VALID, visit_time: "14:30" }), ["visit_time"]);
  assert.deepEqual(errorsFor({ ...VALID, visit_time: "09:00" }), ["visit_time"]);
  assert.deepEqual(errorsFor({ ...VALID, visit_time: "20:00" }), ["visit_time"]);
  assert.deepEqual(errorsFor({ ...VALID, visit_time: "1pm" }), ["visit_time"]);
  assert.equal(parseSiteVisitRequest({ ...VALID, visit_time: "19:00" }).ok, true);
});

test("impossible dates are rejected, not rolled over", () => {
  assert.deepEqual(errorsFor({ ...VALID, visit_date: "2026-02-31" }), ["visit_date"]);
  assert.deepEqual(errorsFor({ ...VALID, visit_date: "21-08-2026" }), ["visit_date"]);
});

test("an unusable phone number is rejected rather than stored as junk", () => {
  assert.deepEqual(errorsFor({ ...VALID, customer: { ...VALID.customer, phone: "12" } }), [
    "customer.phone",
  ]);
});

test("the stage cannot be chosen by the caller", () => {
  assert.deepEqual(errorsFor({ ...VALID, stage: "Completed" }), ["stage"]);
});

test("reschedule and cancel validate their job ids", () => {
  assert.equal(parseRescheduleRequest({ job_id: "nope", visit_date: "2026-08-21", visit_time: "13:00" }).ok, false);
  assert.equal(parseCancelRequest({ job_id: "nope" }).ok, false);

  const cancel = parseCancelRequest({ job_id: "b4f1e3a2-0000-4000-8000-000000000001" });
  assert.ok(cancel.ok);
  // Ends up in loss_reason, which the analytics page counts lost jobs by.
  assert.equal(cancel.value.reason, "Cancelled by customer");
});

test("availability accepts an empty query and refuses a backwards range", () => {
  assert.deepEqual(parseAvailabilityQuery(new URLSearchParams()), {
    ok: true,
    value: { from: null, to: null },
  });

  const backwards = parseAvailabilityQuery(
    new URLSearchParams({ from: "2026-08-25", to: "2026-08-21" })
  );
  assert.equal(backwards.ok, false);
});

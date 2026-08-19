import { NextResponse } from "next/server";
import {
  requireBookingAuth,
  bookingError,
  serverError,
  SLOT_TAKEN_MESSAGE,
} from "@/lib/bookingAuth";
import { parseSiteVisitRequest } from "@/lib/bookingRequest";
import { createSiteVisitBooking } from "@/app/services/bookingService";

export const maxDuration = 30;

/**
 * POST /api/booking/site-visit
 *
 * Creates the job. The customer is matched on phone before being inserted, the
 * slot's capacity is re-checked inside an advisory lock, and the normal
 * post-save path runs afterwards so the visit reaches Google Calendar through
 * the existing sync queue — no change to syncProcessor, no Google credentials
 * anywhere near the assistant.
 *
 * 409 slot_taken is a distinct, machine-readable outcome on purpose: between
 * the assistant offering a slot and the customer confirming it, someone else
 * can take it, and the assistant needs to apologise and re-offer rather than
 * show a generic failure.
 */
export async function POST(request: Request) {
  const unauthorized = requireBookingAuth(request);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bookingError("invalid_json", "The request body is not valid JSON.", 400);
  }

  const parsed = parseSiteVisitRequest(body);
  if (!parsed.ok) {
    return bookingError("validation_failed", "One or more fields are invalid.", 422, {
      details: parsed.errors,
    });
  }

  try {
    const result = await createSiteVisitBooking(parsed.value);

    if (result.status === "slot_taken") {
      return bookingError(
        "slot_taken",
        SLOT_TAKEN_MESSAGE[result.reason],
        409,
        {
          reason: result.reason,
          ...(result.slotCount !== undefined ? { slot_count: result.slotCount } : {}),
          ...(result.dayCount !== undefined ? { day_count: result.dayCount } : {}),
        }
      );
    }

    return NextResponse.json(
      {
        booking: result.booking,
        // A retry of the same key returns the original booking, not a second
        // one. The assistant can use this to tell "I created it" from "I had
        // already created it" without any bookkeeping of its own.
        idempotent_replay: result.status === "duplicate",
        calendar_sync: "queued",
      },
      { status: result.status === "created" ? 201 : 200 }
    );
  } catch (err) {
    return serverError(err, "site-visit booking");
  }
}

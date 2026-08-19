import { NextResponse } from "next/server";
import { requireBookingAuth, bookingError, serverError } from "@/lib/bookingAuth";
import { parseCancelRequest } from "@/lib/bookingRequest";
import { cancelSiteVisit } from "@/app/services/bookingService";

export const maxDuration = 30;

/**
 * POST /api/booking/cancel
 *
 * Cancels a booked site visit: the job is closed with a loss reason, its visit
 * date and time are cleared so the existing sync takes the event off Google
 * Calendar, and the slot stops consuming capacity so it can be sold again.
 *
 * The job row itself is kept. Deleting it would erase the enquiry, the chat
 * summary and the reason it fell through — all of which the office wants, and
 * all of which the analytics page counts.
 *
 * Cancelling an already-cancelled job answers 200, not an error: a retry
 * should settle, not fail.
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

  const parsed = parseCancelRequest(body);
  if (!parsed.ok) {
    return bookingError("validation_failed", "One or more fields are invalid.", 422, {
      details: parsed.errors,
    });
  }

  try {
    const result = await cancelSiteVisit(parsed.value);

    if (result.status === "not_found") {
      return bookingError("job_not_found", "No job exists with that job_id.", 404);
    }

    return NextResponse.json({
      booking: result.booking,
      status: result.status,
      calendar_sync: result.status === "cancelled" ? "queued" : "unchanged",
    });
  } catch (err) {
    return serverError(err, "cancel");
  }
}

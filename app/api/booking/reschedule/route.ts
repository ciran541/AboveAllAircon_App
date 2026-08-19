import { NextResponse } from "next/server";
import {
  requireBookingAuth,
  bookingError,
  serverError,
  SLOT_TAKEN_MESSAGE,
} from "@/lib/bookingAuth";
import { parseRescheduleRequest } from "@/lib/bookingRequest";
import { rescheduleSiteVisit } from "@/app/services/bookingService";

export const maxDuration = 30;

/**
 * POST /api/booking/reschedule
 *
 * Moves an existing site visit to another slot, under the same lock and the
 * same capacity rules as a fresh booking — a reschedule can double-book a slot
 * just as easily as a booking can.
 *
 * Sending the slot the job is already on is not an error: it answers 200 with
 * status "unchanged", so a retried request settles instead of failing.
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

  const parsed = parseRescheduleRequest(body);
  if (!parsed.ok) {
    return bookingError("validation_failed", "One or more fields are invalid.", 422, {
      details: parsed.errors,
    });
  }

  try {
    const result = await rescheduleSiteVisit(parsed.value);

    if (result.status === "not_found") {
      return bookingError("job_not_found", "No job exists with that job_id.", 404);
    }
    if (result.status === "closed") {
      return bookingError(
        "job_closed",
        "That job has been cancelled or closed and cannot be rescheduled. Create a new booking instead.",
        409
      );
    }
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

    return NextResponse.json({
      booking: result.booking,
      status: result.status,
      previous: result.previous,
      calendar_sync: result.status === "rescheduled" ? "queued" : "unchanged",
    });
  } catch (err) {
    return serverError(err, "reschedule");
  }
}

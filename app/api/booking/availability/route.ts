import { NextResponse } from "next/server";
import { requireBookingAuth, bookingError, serverError } from "@/lib/bookingAuth";
import { parseAvailabilityQuery } from "@/lib/bookingRequest";
import { availabilityMeta, loadAvailability, serializeDays } from "@/app/services/availabilityService";
import { bookableSlots } from "@/lib/availability";

export const maxDuration = 30;

/**
 * GET /api/booking/availability?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Which site-visit slots the assistant may offer. Both parameters are
 * optional; the default is the whole offerable window (lead time → horizon).
 * The range is clamped to the horizon rather than rejected, so an assistant
 * asking for more gets what it may sell instead of an error.
 *
 * Reads occupancy from all three appointment types — a day is not free
 * because nobody booked a *survey* on it; an engineer on an installation is
 * not free for one either.
 */
export async function GET(request: Request) {
  const unauthorized = requireBookingAuth(request);
  if (unauthorized) return unauthorized;

  const query = parseAvailabilityQuery(new URL(request.url).searchParams);
  if (!query.ok) {
    return bookingError("validation_failed", "One or more query parameters are invalid.", 422, {
      details: query.errors,
    });
  }

  try {
    const { from, to, days, now, calendarDegraded, calendarStale } = await loadAvailability(
      query.value.from,
      query.value.to
    );

    return NextResponse.json({
      ...availabilityMeta(),
      from,
      to,
      /** Business-timezone now, so the assistant can explain a lead-time refusal. */
      now: `${now.date}T${now.time}`,
      days: serializeDays(days),
      /**
       * True when Google Calendar couldn't be read, so these numbers cover
       * jobs only. Bookings are still accepted — refusing them all during a
       * Google outage would be worse — but work entered directly in Calendar
       * is invisible for now. An alert has already gone to the office.
       */
      calendar_degraded: calendarDegraded,
      calendar_stale: calendarStale,
      /** The same answer flattened — usually all an assistant needs. */
      bookable: bookableSlots(days),
    });
  } catch (err) {
    return serverError(err, "availability");
  }
}

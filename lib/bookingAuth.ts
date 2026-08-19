/**
 * lib/bookingAuth.ts
 *
 * Shared-secret auth for /api/booking/*, following the same pattern as the
 * CRON_SECRET check in app/api/cron/process-sync-queue — a Bearer token in the
 * Authorization header — but on its own secret. Rotating the assistant's key
 * must not silently disable the calendar sync safety net, and a leaked cron
 * secret must not be able to create jobs.
 */

import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const BOOKING_AUTH_HEADER = "Authorization";

/** Constant-time compare that doesn't leak length through an early return. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still burn a comparison so a wrong-length guess isn't measurably faster.
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export type AuthFailure = { response: NextResponse };

/**
 * Returns null when the caller is authorised, or the response to send back.
 *
 * A missing BOOKING_API_SECRET fails closed with 503 rather than accepting
 * everything: an env var that didn't make it into a deployment should look
 * broken, not open.
 */
export function requireBookingAuth(request: Request): NextResponse | null {
  const expected = process.env.BOOKING_API_SECRET;
  if (!expected) {
    console.error("[booking] BOOKING_API_SECRET is not set — refusing all requests.");
    return NextResponse.json(
      {
        error: "not_configured",
        message: "The booking API is not configured on this deployment.",
      },
      { status: 503 }
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !secretsMatch(token, expected)) {
    return NextResponse.json(
      {
        error: "unauthorized",
        message: "Missing or invalid Authorization: Bearer <BOOKING_API_SECRET>.",
      },
      { status: 401 }
    );
  }

  return null;
}

// ── Shared response shapes ────────────────────────────────────────────────────

/** Every error this API returns has this shape: a stable code, plus prose. */
export function bookingError(
  code: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ error: code, message, ...extra }, { status });
}

export function serverError(err: unknown, context: string): NextResponse {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[booking] ${context}:`, message);
  return bookingError(
    "server_error",
    "The booking service failed to complete this request. It is safe to retry with the same idempotency key.",
    500
  );
}

/**
 * Why a slot could not be taken, in words the assistant can say out loud.
 *
 * All of these come back as 409 `slot_taken` with the code in `reason`: from
 * the assistant's point of view they mean one thing — offer something else —
 * and giving each its own HTTP status would only multiply the branches an
 * adapter has to handle. 422 stays for "your request was malformed".
 */
export const SLOT_TAKEN_MESSAGE: Record<string, string> = {
  slot_full:
    "That slot was taken while the customer was deciding. Fetch availability again and offer another.",
  day_full:
    "That day is fully booked. Fetch availability again and offer another day.",
  calendar_block:
    "That time is blocked in the office calendar. Fetch availability again and offer another.",
  non_working_day: "Site visits are Monday to Saturday only.",
  blackout: "The office is closed that day. Fetch availability again and offer another.",
  past_lead_time:
    "That slot is too soon. Bookings need a few hours' notice — fetch availability again for what is still open.",
  beyond_horizon: "That date is further ahead than bookings are taken.",
};

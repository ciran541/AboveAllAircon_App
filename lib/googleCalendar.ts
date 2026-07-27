import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Types ─────────────────────────────────────────────────────────────────────

type Customer = {
  name: string;
  phone: string | null;
  address: string | null;
};

export type CalendarEventType = "site_visit" | "job" | "second_visit";

type UpsertParams = {
  type: CalendarEventType;
  job: {
    id: string;
    service_type: string;
    notes: string | null;
    customers?: Customer | null;
  };
  date: string;              // YYYY-MM-DD
  time: string | null;       // HH:MM or null
  existingEventId?: string | null;
};

type CalendarEventPayload = {
  summary: string;
  description: string;
  status: "confirmed";
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
};

type DeleteMeta = { jobId?: string | null; type?: CalendarEventType | null };

export type CalendarLogOperation = "create" | "update" | "delete" | "drift_detected";

// ── Config ────────────────────────────────────────────────────────────────────

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

const EVENT_CONFIG: Record<CalendarEventType, { prefix: string; colorId: string }> = {
  site_visit: { prefix: "[Site Visit]", colorId: "3" },   // purple (grape)
  job: { prefix: "[Job]", colorId: "8" },   // grey (graphite)
  second_visit: { prefix: "[2nd Visit]", colorId: "8" },   // grey (graphite)
};

// ── Retry helper ──────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 1000): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const message = err?.message ?? "";
      // Google signals rate limiting as HTTP 403 with one of these reasons —
      // that's a transient, retry-worthy condition, not the same as a real
      // 401/403 auth/permission failure. Treating all 403s as permanent (as
      // this used to) meant a burst of concurrent calls (e.g. the drift-check
      // healing many jobs at once) would rate-limit and then never retry,
      // silently leaving events unhealed.
      const isRateLimit = /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(message);
      // __EVENT_GONE__ is our own signal that the target event no longer exists;
      // retrying the same PATCH can only fail identically, so bail out at once
      // and let the caller recreate.
      const isPermanent =
        message.startsWith("__EVENT_GONE__") || (/\b(401|403)\b/.test(message) && !isRateLimit);
      if (isPermanent || attempt === maxAttempts) throw err;
      const delay = isRateLimit ? baseDelayMs * attempt * 2 : baseDelayMs * attempt;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

// ── Audit log ─────────────────────────────────────────────────────────────────

/**
 * Records every Calendar mutation this app makes (or attempts), independent of
 * outcome. This is a forensics/audit trail, not the retry mechanism (that's
 * sync_queue) — it exists so a future "why did this event disappear" question
 * can be answered definitively ("our app never touched it") instead of
 * inferred after the fact from Calendar's own timestamps.
 * Best-effort: a logging failure must never break the actual Calendar call.
 */
export async function logCalendarEvent(entry: {
  jobId?: string | null;
  eventType?: CalendarEventType | null;
  operation: CalendarLogOperation;
  eventId?: string | null;
  success: boolean;
  error?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("calendar_event_log").insert({
      job_id: entry.jobId ?? null,
      event_type: entry.eventType ?? null,
      operation: entry.operation,
      event_id: entry.eventId ?? null,
      success: entry.success,
      error: entry.error ?? null,
    });
  } catch (err) {
    console.error("[calendarEventLog] failed to write audit log:", err);
  }
}

// ── JWT / Auth ────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createSignedJwt(clientEmail: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: CALENDAR_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const content = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(content);
  signer.end();

  const signature = signer
    .sign(privateKey)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${content}.${signature}`;
}

async function getAccessToken(): Promise<string> {
  const clientEmail = getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");
  const assertion = createSignedJwt(clientEmail, privateKey);

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  return withRetry(async () => {
    const tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Failed to get Google access token: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenData.access_token) throw new Error("Google token response did not include access_token.");
    return tokenData.access_token;
  });
}

// ── Event building ────────────────────────────────────────────────────────────

function buildStartEnd(date: string, time: string | null): { start: string; end: string } {
  const safeTime = time && time.trim() ? time : "09:00";
  const start = `${date}T${safeTime}:00+08:00`;

  const [hourText = "09", minuteText = "00"] = safeTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const endHour = Number.isFinite(hour) ? Math.min(hour + 1, 23) : 10;
  const endMinute = Number.isFinite(minute) ? minute : 0;
  const end = `${date}T${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}:00+08:00`;

  return { start, end };
}

function buildEventPayload(params: UpsertParams): CalendarEventPayload {
  const timezone = "Asia/Singapore";
  const config = EVENT_CONFIG[params.type];
  const { start, end } = buildStartEnd(params.date, params.time);

  const customerName = params.job.customers?.name || "Customer";
  const customerPhone = params.job.customers?.phone || "N/A";
  const customerAddress = params.job.customers?.address || "N/A";
  const jobNotes = params.job.notes?.trim() || "No notes";

  return {
    summary: `${config.prefix} ${customerAddress} | ${customerPhone}`,
    description: [
      `Customer: ${customerName}`,
      `Phone: ${customerPhone}`,
      `Address: ${customerAddress}`,
      `Notes: ${jobNotes}`,
    ].join("\n"),
    // Always force the event back to confirmed. If someone manually deletes
    // an event directly in Calendar, Google soft-deletes it (status becomes
    // "cancelled", invisible in the UI) rather than purging it — a later PATCH
    // to that same event id otherwise returns 200 OK without ever un-cancelling
    // it, so our own sync would report "success" while the event stays hidden.
    // Real deletions already go through deleteCalendarEvent() (a hard DELETE),
    // so any event still being upserted here should always end up confirmed.
    status: "confirmed",
    start: { dateTime: start, timeZone: timezone },
    end: { dateTime: end, timeZone: timezone },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates or updates a typed calendar event (site visit / job / second visit).
 * Pass `existingEventId` to update an existing event (PATCH), otherwise a new one is created (POST).
 */
export async function upsertCalendarEvent(params: UpsertParams): Promise<{ eventId: string }> {
  const calendarId = encodeURIComponent(getRequiredEnv("GOOGLE_CALENDAR_ID"));
  const token = await getAccessToken();
  return _upsertWithToken(token, calendarId, params);
}

/**
 * Deletes a calendar event by its event ID. Safe to call even if the event no longer exists.
 * `meta` is optional and only used for the audit log (lib/googleCalendar.ts's calendar_event_log).
 */
export async function deleteCalendarEvent(eventId: string, meta?: DeleteMeta): Promise<void> {
  if (!eventId) return;
  const calendarId = encodeURIComponent(getRequiredEnv("GOOGLE_CALENDAR_ID"));
  const token = await getAccessToken();
  await _deleteWithToken(token, calendarId, eventId, meta);
}

export type ListedEvent = {
  status: string;
  /** RFC3339 instant for a timed event. */
  startDateTime?: string;
  /** YYYY-MM-DD for an all-day event. */
  startDate?: string;
};

/**
 * Bulk-fetches every event on the calendar from `timeMinIso` onward, keyed by
 * event id. Used by reconciliation: checking a few hundred events one-by-one
 * took minutes, blew past the route's maxDuration and tripped Google's rate
 * limiter, whereas listing them is 1-2 calls.
 *
 * `showDeleted` is what makes soft-deleted ("cancelled") events visible —
 * without it a manually-deleted event is indistinguishable from a healthy one.
 */
export async function listCalendarEvents(timeMinIso: string): Promise<Map<string, ListedEvent>> {
  const calendarId = encodeURIComponent(getRequiredEnv("GOOGLE_CALENDAR_ID"));
  const token = await getAccessToken();
  const events = new Map<string, ListedEvent>();
  let pageToken: string | undefined;

  do {
    const search = new URLSearchParams({
      showDeleted: "true",
      maxResults: "2500",
      timeMin: timeMinIso,
      fields: "nextPageToken,items(id,status,start)",
    });
    if (pageToken) search.set("pageToken", pageToken);

    const page: {
      items?: { id?: string; status?: string; start?: { dateTime?: string; date?: string } }[];
      nextPageToken?: string;
    } = await withRetry(async () => {
      const response = await fetch(
        `${CALENDAR_API_BASE}/calendars/${calendarId}/events?${search.toString()}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list calendar events: ${response.status} ${errorText}`);
      }
      return response.json();
    });

    for (const item of page.items ?? []) {
      if (!item.id || !item.status) continue;
      events.set(item.id, {
        status: item.status,
        startDateTime: item.start?.dateTime,
        startDate: item.start?.date,
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return events;
}

/** The instant an event for this slot is supposed to start. */
export function expectedEventStart(date: string, time: string | null): string {
  return buildStartEnd(date, time).start;
}

/**
 * Reads an event's actual start back as a { date, time } pair in the
 * calendar's own timezone — i.e. what a person sees in Google Calendar,
 * not the server's locale. Used when accepting a reschedule that was made
 * directly in Calendar.
 */
export async function getCalendarEventStart(
  eventId: string
): Promise<{ date: string; time: string | null } | null> {
  const calendarId = encodeURIComponent(getRequiredEnv("GOOGLE_CALENDAR_ID"));
  const token = await getAccessToken();

  return withRetry(async () => {
    const response = await fetch(
      `${CALENDAR_API_BASE}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}?fields=start`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to read calendar event start: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { start?: { dateTime?: string; date?: string } };
    if (data.start?.date) return { date: data.start.date, time: null }; // all-day
    if (!data.start?.dateTime) return null;

    const timezone = process.env.GOOGLE_CALENDAR_TIME_ZONE || "Asia/Singapore";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(data.start.dateTime));

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    // en-CA renders midnight as "24" in some runtimes; normalize it.
    const hour = get("hour") === "24" ? "00" : get("hour");
    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      time: `${hour}:${get("minute")}`,
    };
  });
}

/**
 * Returns the event's current status ("confirmed" | "tentative" | "cancelled"),
 * or null if the event is gone entirely (404/410). Single-event variant of
 * listCalendarEventStatuses, for one-off checks.
 */
export async function getCalendarEventStatus(eventId: string): Promise<string | null> {
  if (!eventId) return null;
  const calendarId = encodeURIComponent(getRequiredEnv("GOOGLE_CALENDAR_ID"));
  const token = await getAccessToken();

  return withRetry(async () => {
    const response = await fetch(
      `${CALENDAR_API_BASE}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch calendar event status: ${response.status} ${errorText}`);
    }
    const data = (await response.json()) as { status?: string };
    return data.status ?? null;
  });
}

// ── Internal token-reusing helpers ────────────────────────────────────────────

async function _upsertWithToken(
  token: string,
  calendarId: string,
  params: UpsertParams,
  /** Set when retrying as a create after the stored event id turned out to be gone. */
  forceCreate = false
): Promise<{ eventId: string }> {
  const payload = buildEventPayload(params);
  const useExisting = Boolean(params.existingEventId) && !forceCreate;
  const method = useExisting ? "PATCH" : "POST";
  const eventPath = useExisting
    ? `/calendars/${calendarId}/events/${encodeURIComponent(params.existingEventId as string)}`
    : `/calendars/${calendarId}/events`;

  // Only set colorId on create. PATCH is a partial update — omitting a field
  // leaves it untouched on the existing event — so once created, an event's
  // color is left alone forever. This lets manual recoloring done directly in
  // Calendar (e.g. marking a job orange for "given to subcon") survive every
  // future sync instead of being silently reset back to the default on the
  // next job edit.
  const body: CalendarEventPayload & { colorId?: string } =
    method === "POST" ? { ...payload, colorId: EVENT_CONFIG[params.type].colorId } : payload;
  const operation: CalendarLogOperation = method === "POST" ? "create" : "update";

  try {
    const result = await withRetry(async () => {
      const response = await fetch(`${CALENDAR_API_BASE}${eventPath}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });

      if (!response.ok) {
        const errorText = await response.text();
        // A stored event id that Google no longer knows about (hard-deleted and
        // purged) would otherwise fail this PATCH identically forever, leaving
        // the job permanently off the calendar. Signal the caller to recreate.
        if (method === "PATCH" && (response.status === 404 || response.status === 410)) {
          throw new Error(`__EVENT_GONE__ ${response.status}`);
        }
        throw new Error(`Google Calendar upsert failed (${params.type}): ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as { id?: string };
      if (!data.id) throw new Error("Google Calendar response did not include event id.");
      return { eventId: data.id };
    });

    await logCalendarEvent({
      jobId: params.job.id,
      eventType: params.type,
      operation,
      eventId: result.eventId,
      success: true,
    });
    return result;
  } catch (err: any) {
    const message = err?.message ?? String(err);

    // Stored event id is gone from Google — recreate rather than failing this
    // job's calendar sync forever. Logged as its own entry so the recreate is
    // visible in the audit trail instead of looking like a normal create.
    if (message.startsWith("__EVENT_GONE__") && !forceCreate) {
      await logCalendarEvent({
        jobId: params.job.id,
        eventType: params.type,
        operation: "drift_detected",
        eventId: params.existingEventId ?? null,
        success: true,
        error: `Stored event no longer exists on Google (${message.replace("__EVENT_GONE__ ", "")}); recreating.`,
      });
      return _upsertWithToken(token, calendarId, params, true);
    }

    await logCalendarEvent({
      jobId: params.job.id,
      eventType: params.type,
      operation,
      eventId: params.existingEventId ?? null,
      success: false,
      error: message,
    });
    throw err;
  }
}

async function _deleteWithToken(
  token: string,
  calendarId: string,
  eventId: string,
  meta?: DeleteMeta
): Promise<void> {
  try {
    await withRetry(async () => {
      const response = await fetch(
        `${CALENDAR_API_BASE}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );
      // 404 means it's already gone — that's fine
      if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        throw new Error(`Google Calendar delete failed: ${response.status} ${errorText}`);
      }
    });
    await logCalendarEvent({
      jobId: meta?.jobId,
      eventType: meta?.type,
      operation: "delete",
      eventId,
      success: true,
    });
  } catch (err: any) {
    await logCalendarEvent({
      jobId: meta?.jobId,
      eventType: meta?.type,
      operation: "delete",
      eventId,
      success: false,
      error: err?.message ?? String(err),
    });
    throw err;
  }
}

// ── Batch API (single token, parallel operations) ─────────────────────────────

export type BatchUpsertEntry = UpsertParams & { col: string };

/**
 * Fetches a single auth token then runs all upsert/delete operations in parallel.
 * Returns a map of { col -> eventId | null } for the caller to persist,
 * and an array of error strings for any failed operations.
 */
export async function batchSyncCalendarEvents(ops: {
  upserts: (UpsertParams & { col: string })[];
  deletes: (DeleteMeta & { eventId: string; col: string })[];
}): Promise<{
  saved: Record<string, string>;   // col -> new eventId
  cleared: string[];               // col names to set null
  errors: string[];
}> {
  const calendarId = encodeURIComponent(getRequiredEnv("GOOGLE_CALENDAR_ID"));
  const token = await getAccessToken();

  const saved: Record<string, string> = {};
  const cleared: string[] = [];
  const errors: string[] = [];

  await Promise.all([
    ...ops.upserts.map(async ({ col, ...params }) => {
      try {
        const { eventId } = await _upsertWithToken(token, calendarId, params);
        saved[col] = eventId;
      } catch (err: any) {
        errors.push(`[${params.type}] ${err.message}`);
      }
    }),
    ...ops.deletes.map(async ({ eventId, col, jobId, type }) => {
      try {
        await _deleteWithToken(token, calendarId, eventId, { jobId, type });
        cleared.push(col);
      } catch (err: any) {
        errors.push(`[delete:${col}] ${err.message}`);
      }
    }),
  ]);

  return { saved, cleared, errors };
}
import crypto from "node:crypto";

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
  colorId: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
};

// ── Config ────────────────────────────────────────────────────────────────────

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

const EVENT_CONFIG: Record<CalendarEventType, { prefix: string; colorId: string }> = {
  site_visit:   { prefix: "[Site Visit]", colorId: "3" },   // purple (grape)
  job:          { prefix: "[Job]",         colorId: "8" },   // grey (graphite)
  second_visit: { prefix: "[2nd Visit]",   colorId: "8" },   // grey (graphite)
};

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
}

// ── Event building ────────────────────────────────────────────────────────────

function buildStartEnd(date: string, time: string | null): { start: string; end: string } {
  const safeTime = time && time.trim() ? time : "09:00";
  const start = `${date}T${safeTime}:00+08:00`;

  const [hourText = "09", minuteText = "00"] = safeTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const endHour = Number.isFinite(hour) ? Math.min(hour + 2, 23) : 11;
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
    summary: `${config.prefix} ${customerAddress} - ${customerPhone}`,
    description: [
      `Customer: ${customerName}`,
      `Phone: ${customerPhone}`,
      `Address: ${customerAddress}`,
      `Notes: ${jobNotes}`,
    ].join("\n"),
    colorId: config.colorId,
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
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  if (!eventId) return;
  const calendarId = encodeURIComponent(getRequiredEnv("GOOGLE_CALENDAR_ID"));
  const token = await getAccessToken();
  await _deleteWithToken(token, calendarId, eventId);
}

// ── Internal token-reusing helpers ────────────────────────────────────────────

async function _upsertWithToken(
  token: string,
  calendarId: string,
  params: UpsertParams
): Promise<{ eventId: string }> {
  const payload = buildEventPayload(params);
  const method = params.existingEventId ? "PATCH" : "POST";
  const eventPath = params.existingEventId
    ? `/calendars/${calendarId}/events/${encodeURIComponent(params.existingEventId)}`
    : `/calendars/${calendarId}/events`;

  const response = await fetch(`${CALENDAR_API_BASE}${eventPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Calendar upsert failed (${params.type}): ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { id?: string };
  if (!data.id) throw new Error("Google Calendar response did not include event id.");
  return { eventId: data.id };
}

async function _deleteWithToken(
  token: string,
  calendarId: string,
  eventId: string
): Promise<void> {
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
  deletes: { eventId: string; col: string }[];
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
    ...ops.deletes.map(async ({ eventId, col }) => {
      try {
        await _deleteWithToken(token, calendarId, eventId);
        cleared.push(col);
      } catch (err: any) {
        errors.push(`[delete:${col}] ${err.message}`);
      }
    }),
  ]);

  return { saved, cleared, errors };
}
/**
 * scripts/backfill-calendar-titles.mjs
 *
 * ONE-OFF. Retitles calendar events that already exist so they carry the
 * customer's unit type, e.g. "[Job] 3 Oxford Road…" -> "[Job · Condo] 3 Oxford
 * Road…". Without this, existing events only pick up the new tag the next time
 * their job or customer happens to be saved.
 *
 * Deliberately NOT a full re-sync (enqueue_sync + processJobQueue). This is a
 * cosmetic change, so it does the narrowest thing that achieves it:
 *   - PATCHes summary + description only. start/end are never sent, so this
 *     cannot move an event or undo a reschedule someone accepted in Calendar.
 *   - Only touches slots that already hold an event id. It never creates, so it
 *     cannot resurrect an event that isn't there.
 *   - Skips slots recorded in calendar_slot_removals, i.e. ones a person
 *     deleted by hand. Those stay deleted — same rule the sync processor uses.
 *
 * The summary/description format below MUST mirror buildEventPayload() in
 * lib/googleCalendar.ts — that file is the source of truth. This script is a
 * throwaway copy of it, not a second implementation to maintain.
 *
 * Usage (from the repo root):
 *   node scripts/backfill-calendar-titles.mjs              # dry run, writes nothing
 *   node scripts/backfill-calendar-titles.mjs --apply      # actually patches
 *   node scripts/backfill-calendar-titles.mjs --from=2026-01-01 --apply
 *
 * --from defaults to today: past events don't help anyone allocate manpower,
 * and each one is an API call against Google's rate limit.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── Env ───────────────────────────────────────────────────────────────────────

function loadEnvLocal() {
  const raw = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

loadEnvLocal();

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const fromArg = args.find((a) => a.startsWith("--from="))?.slice("--from=".length);
const today = new Date();
const defaultFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
  today.getDate()
).padStart(2, "0")}`;
const fromDate = fromArg || defaultFrom;

if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
  console.error(`--from must be YYYY-MM-DD, got "${fromDate}"`);
  process.exit(1);
}

// ── Google auth (mirrors lib/googleCalendar.ts) ────────────────────────────────

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken() {
  const clientEmail = requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = requiredEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/calendar",
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

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${content}.${signature}`,
    }),
  });
  if (!response.ok) throw new Error(`Token request failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  if (!data.access_token) throw new Error("Token response had no access_token");
  return data.access_token;
}

// ── Payload (mirrors buildEventPayload in lib/googleCalendar.ts) ───────────────

const EVENT_LABEL = {
  site_visit: "Site Visit",
  job: "Job",
  second_visit: "2nd Visit",
};

function buildTitleAndDescription(job, customer, type) {
  const customerName = customer?.name || "Customer";
  const customerPhone = customer?.phone || "N/A";
  const customerAddress = customer?.address || "N/A";
  const jobNotes = job.notes?.trim() || "No notes";
  const unitType = customer?.unit_type?.trim() || null;
  const label = EVENT_LABEL[type];
  const prefix = `[${unitType ? `${label} · ${unitType}` : label}]`;

  return {
    summary: `${prefix} ${customerAddress} | ${customerPhone}`,
    description: [
      `Customer: ${customerName}`,
      `Phone: ${customerPhone}`,
      `Address: ${customerAddress}`,
      `Unit type: ${unitType ?? "Not specified"}`,
      `Notes: ${jobNotes}`,
    ].join("\n"),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const SLOTS = [
  { type: "site_visit", dateCol: "visit_date", idCol: "visit_event_id" },
  { type: "job", dateCol: "job_date", idCol: "job_event_id" },
  { type: "second_visit", dateCol: "second_visit_date", idCol: "second_visit_event_id" },
];

async function main() {
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select(
      "id, notes, visit_date, job_date, second_visit_date, " +
        "visit_event_id, job_event_id, second_visit_event_id, " +
        "customers(name, phone, address, unit_type)"
    )
    .or("visit_event_id.not.is.null,job_event_id.not.is.null,second_visit_event_id.not.is.null");

  if (error) {
    console.error("Failed to read jobs:", error.message);
    process.exit(1);
  }

  const { data: removalRows, error: removalError } = await supabase
    .from("calendar_slot_removals")
    .select("job_id, event_type, slot_date");

  // Bailing out is the point: treating an unreadable removals table as "no
  // removals" would retitle events somebody deliberately deleted.
  if (removalError) {
    console.error("Failed to read calendar_slot_removals:", removalError.message);
    process.exit(1);
  }
  const removals = new Map((removalRows ?? []).map((r) => [`${r.job_id}:${r.event_type}`, r.slot_date]));

  const targets = [];
  const skipped = { noUnitType: 0, past: 0, handDeleted: 0 };

  for (const job of jobs ?? []) {
    const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;
    for (const slot of SLOTS) {
      const eventId = job[slot.idCol];
      const date = job[slot.dateCol];
      if (!eventId || !date) continue;
      if (removals.get(`${job.id}:${slot.type}`) === date) {
        skipped.handDeleted++;
        continue;
      }
      if (date < fromDate) {
        skipped.past++;
        continue;
      }
      // No unit type recorded means the title is byte-identical to what's
      // already on the calendar — nothing to push.
      if (!customer?.unit_type?.trim()) {
        skipped.noUnitType++;
        continue;
      }
      targets.push({
        jobId: job.id,
        type: slot.type,
        eventId,
        date,
        ...buildTitleAndDescription(job, customer, slot.type),
      });
    }
  }

  console.log(`Scanned ${(jobs ?? []).length} jobs with calendar events, from ${fromDate} onward.`);
  console.log(`  ${targets.length} event(s) to retitle`);
  console.log(`  skipped: ${skipped.past} dated before ${fromDate} (widen with --from=YYYY-MM-DD)`);
  console.log(`  skipped: ${skipped.noUnitType} whose customer has no unit type recorded`);
  console.log(`  skipped: ${skipped.handDeleted} deleted by hand in Calendar (left alone by design)`);

  if (targets.length === 0) return;

  if (!apply) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to patch these:\n");
    for (const t of targets) console.log(`  ${t.date}  ${t.summary}`);
    return;
  }

  const calendarId = encodeURIComponent(requiredEnv("GOOGLE_CALENDAR_ID"));
  const token = await getAccessToken();
  let ok = 0;
  const failures = [];

  // Serial with a small gap. A burst of PATCHes trips Google's per-user rate
  // limiter, and this is a one-off — there's nothing to gain from going fast.
  for (const t of targets) {
    try {
      const response = await fetch(
        `${CALENDAR_API_BASE}/calendars/${calendarId}/events/${encodeURIComponent(t.eventId)}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ summary: t.summary, description: t.description }),
        }
      );
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      ok++;
      console.log(`  ok  ${t.summary}`);
    } catch (err) {
      failures.push({ ...t, error: err.message });
      console.error(`  FAIL ${t.jobId} ${t.type}: ${err.message}`);
    }

    // Same audit trail every other Calendar mutation writes, so this backfill
    // is visible in calendar_event_log rather than looking like drift later.
    await supabase.from("calendar_event_log").insert({
      job_id: t.jobId,
      event_type: t.type,
      operation: "update",
      event_id: t.eventId,
      success: !failures.some((f) => f.eventId === t.eventId),
      error: failures.find((f) => f.eventId === t.eventId)?.error ?? null,
    });

    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\nDone. ${ok} retitled, ${failures.length} failed.`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

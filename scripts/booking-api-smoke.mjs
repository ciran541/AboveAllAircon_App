/**
 * scripts/booking-api-smoke.mjs
 *
 * End-to-end check of /api/booking/* against a running deployment. This is
 * what produces the captured responses in docs/booking-api.md, and what proves
 * the things unit tests can't: the advisory lock, the idempotency constraint,
 * the phone lookup, and that a booking really lands in sync_queue and comes
 * back with a Google Calendar event id.
 *
 * It creates real jobs. Everything it creates is cancelled at the end (which
 * takes the events back off the calendar through the normal sync path), and
 * --purge additionally deletes the rows afterwards.
 *
 * Usage (from the repo root):
 *   node scripts/booking-api-smoke.mjs                          # localhost:3000
 *   node scripts/booking-api-smoke.mjs --base=https://staging.example.com
 *   node scripts/booking-api-smoke.mjs --purge                  # delete the test rows too
 *   node scripts/booking-api-smoke.mjs --out=tmp/transcript.json
 *
 * Requires BOOKING_API_SECRET (and, for the database assertions and --purge,
 * SUPABASE_SERVICE_ROLE_KEY) in .env.local.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ── Env / args ────────────────────────────────────────────────────────────────

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

const args = process.argv.slice(2);
const arg = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const BASE = arg("base", "http://localhost:3000").replace(/\/$/, "");
const OUT = arg("out", null);
const PURGE = args.includes("--purge");
const SECRET = process.env.BOOKING_API_SECRET;

if (!SECRET) {
  console.error("BOOKING_API_SECRET is not set (looked in the environment and .env.local).");
  process.exit(1);
}

const admin =
  process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
    : null;

// ── Plumbing ──────────────────────────────────────────────────────────────────

const transcript = [];
let failures = 0;
const createdJobIds = new Set();

function check(name, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

async function call(method, path, { body, auth = true } = {}) {
  const started = Date.now();
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(auth ? { Authorization: `Bearer ${SECRET}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { non_json_body: text.slice(0, 500) };
  }

  transcript.push({
    request: { method, path, body: body ?? null, authenticated: auth },
    response: { status: response.status, body: json },
    ms: Date.now() - started,
  });
  return { status: response.status, body: json };
}

const uuid = () => crypto.randomUUID();
const phone = () => `9${String(Math.floor(Math.random() * 9_000_000) + 1_000_000).padStart(7, "0")}`;

function customerPayload(overrides = {}) {
  return {
    name: "Smoke Test Customer",
    phone: phone(),
    address: "Blk 1 Test Ave #01-01, Singapore 000000",
    unit_type: "hdb",
    ...overrides,
  };
}

function bookingPayload(slot, customer, overrides = {}) {
  return {
    idempotency_key: uuid(),
    visit_date: slot.date,
    visit_time: slot.slot,
    service_type: "new_installation",
    unit_count: 2,
    ac_brand: "Mitsubishi",
    source: "WhatsApp",
    chat_summary: "Automated smoke test — safe to delete.",
    indicative_quote: 2400,
    customer,
    ...overrides,
  };
}

function remember(result) {
  const id = result.body?.booking?.job_id;
  if (id) createdJobIds.add(id);
  return result;
}

// ── The run ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Booking API smoke test against ${BASE}\n`);

  // 1 — auth ------------------------------------------------------------------
  console.log("Auth");
  const noAuth = await call("GET", "/api/booking/availability", { auth: false });
  check("unauthenticated availability is refused", noAuth.status === 401, JSON.stringify(noAuth.body));
  check("the refusal is machine-readable", noAuth.body?.error === "unauthorized");

  // 2 — availability ----------------------------------------------------------
  console.log("\nAvailability");
  const availability = await call("GET", "/api/booking/availability");
  check("availability responds 200", availability.status === 200, JSON.stringify(availability.body).slice(0, 300));
  check(
    "it accounts for Google Calendar",
    availability.body?.calendar_degraded === false,
    "calendar_degraded is true — Google could not be read, so availability is jobs-only"
  );
  check(
    "the slot grid is the published one",
    availability.body?.slots?.length === 10 &&
      availability.body?.slots?.[0]?.slot === "10:00" &&
      availability.body?.slots?.[9]?.slot === "19:00",
    JSON.stringify(availability.body?.slots?.map((s) => s.slot))
  );

  const free = availability.body?.bookable ?? [];
  check("at least three slots are on offer", free.length >= 3, `got ${free.length}`);
  if (free.length < 3) {
    console.error("Not enough free slots to run the rest of the test.");
    return;
  }
  const [slotA, slotB] = free;

  // For the race, a slot whose whole capacity is free AND whose day has room
  // for all of it — otherwise the day ceiling, not the slot, decides who wins
  // and the assertion below would be measuring the wrong thing.
  const days = availability.body?.days ?? [];
  const slotCapacity = availability.body?.slots?.[0]?.capacity ?? 1;
  let contested = null;
  for (const day of days) {
    if (day.day_remaining < slotCapacity + 1) continue;
    const slot = day.slots.find(
      (s) => s.available && s.remaining >= slotCapacity && !(day.date === slotA.date && s.slot === slotA.slot) && !(day.date === slotB.date && s.slot === slotB.slot)
    );
    if (slot) {
      contested = { date: day.date, slot: slot.slot, remaining: slot.remaining };
      break;
    }
  }

  // 3 — validation ------------------------------------------------------------
  console.log("\nValidation");
  const invalid = await call("POST", "/api/booking/site-visit", {
    body: { visit_date: "2026-02-31", visit_time: "14:30", quoted_amount: 2400, customer: {} },
  });
  check("a bad payload is refused with 422", invalid.status === 422);
  check(
    "every problem is reported at once",
    Array.isArray(invalid.body?.details) && invalid.body.details.length >= 5,
    JSON.stringify(invalid.body?.details)
  );
  check(
    "quoted_amount is refused explicitly",
    invalid.body?.details?.some((d) => d.field === "quoted_amount")
  );

  // 3b — rules the lock can't see ---------------------------------------------
  const sunday = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7 || 7));
    return d.toISOString().slice(0, 10);
  })();
  const onSunday = await call("POST", "/api/booking/site-visit", {
    body: bookingPayload({ date: sunday, slot: "10:00" }, customerPayload()),
  });
  check("a Sunday is refused", onSunday.status === 409, `${onSunday.status}`);
  check("with the reason", onSunday.body?.reason === "non_working_day", JSON.stringify(onSunday.body));

  // 4 — the happy path --------------------------------------------------------
  console.log("\nBooking");
  const customer = customerPayload();
  const payload = bookingPayload(slotA, customer);
  const created = remember(await call("POST", "/api/booking/site-visit", { body: payload }));

  check("a valid booking is created with 201", created.status === 201, JSON.stringify(created.body).slice(0, 400));
  check("it lands at the right stage", created.body?.booking?.stage === "Site Visit Scheduled");
  check("it holds the slot it asked for", created.body?.booking?.visit_date === slotA.date && created.body?.booking?.visit_time === slotA.slot);
  check("the phone was normalised", created.body?.booking?.customer?.phone === customer.phone);
  check("hdb mapped to Resale", created.body?.booking?.customer?.unit_type === "Resale");
  check("no quoted_amount was set", created.body?.booking?.quoted_amount === undefined);
  check("the indicative quote went to internal_notes", /Indicative quote/.test(created.body?.booking?.internal_notes ?? ""));

  // 5 — idempotency -----------------------------------------------------------
  console.log("\nIdempotency");
  const replay = await call("POST", "/api/booking/site-visit", { body: payload });
  check("a repeated key answers 200", replay.status === 200);
  check("it returns the original job", replay.body?.booking?.job_id === created.body?.booking?.job_id);
  check("it says so", replay.body?.idempotent_replay === true);

  if (admin) {
    const { count } = await admin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("booking_idempotency_key", payload.idempotency_key);
    check("exactly one job exists for that key", count === 1, `count=${count}`);
  }

  // 6 — the slot is gone ------------------------------------------------------
  const afterBooking = await call(
    "GET",
    `/api/booking/availability?from=${slotA.date}&to=${slotA.date}`
  );
  const slotAState = afterBooking.body?.days?.[0]?.slots?.find((s) => s.slot === slotA.slot);
  check("the booked slot stops being offered", slotAState?.available === false, JSON.stringify(slotAState));
  check("and says why", slotAState?.reason === "slot_full" || slotAState?.reason === "day_full");

  // 7 — the repeat customer ---------------------------------------------------
  console.log("\nRepeat customer");
  const repeat = remember(
    await call("POST", "/api/booking/site-visit", {
      body: bookingPayload(slotB, {
        ...customer,
        // Same subscriber, spelled the way a chat app hands it over.
        phone: `+65 ${customer.phone.slice(0, 4)} ${customer.phone.slice(4)}`,
        name: "Smoke Test Customer (2nd enquiry)",
      }),
    })
  );
  check("a second booking succeeds", repeat.status === 201, JSON.stringify(repeat.body).slice(0, 300));
  check(
    "and reuses the existing customer row",
    repeat.body?.booking?.customer?.id === created.body?.booking?.customer?.id,
    `${repeat.body?.booking?.customer?.id} vs ${created.body?.booking?.customer?.id}`
  );

  // 8 — the race --------------------------------------------------------------
  console.log("\nConcurrency");
  if (!contested) {
    console.log("  no slot with a full capacity free today — skipping the race");
  } else {
    // One more contender than the slot can hold: every seat should be taken
    // exactly once, and the extra should be told the slot went.
    const contenders = contested.remaining + 1;
    const racers = await Promise.all(
      Array.from({ length: contenders }, () =>
        call("POST", "/api/booking/site-visit", {
          body: bookingPayload(contested, customerPayload()),
        })
      )
    );
    racers.forEach(remember);

    const winners = racers.filter((r) => r.status === 201);
    const losers = racers.filter((r) => r.status === 409);
    check(
      `exactly ${contested.remaining} of ${contenders} simultaneous bookings win`,
      winners.length === contested.remaining,
      `${winners.length} winners of ${contenders}`
    );
    check("the loser gets 409", losers.length === 1, `${losers.length} losers`);
    check("with a machine-readable reason", losers.every((l) => l.body?.error === "slot_taken"));
    check(
      "and a reason it can act on",
      losers.every((l) => ["slot_full", "day_full"].includes(l.body?.reason)),
      JSON.stringify(losers.map((l) => l.body?.reason))
    );

    if (admin) {
      const { count } = await admin
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("visit_date", contested.date)
        .eq("visit_time", contested.slot);
      check(
        "the slot holds no more jobs than its capacity",
        count <= slotCapacity,
        `count=${count} capacity=${slotCapacity}`
      );
    }
  }

  // 9 — the sync path ---------------------------------------------------------
  if (admin) {
    console.log("\nCalendar sync");
    const jobId = created.body?.booking?.job_id;
    const { data: queue } = await admin
      .from("sync_queue")
      .select("integration, status, last_error")
      .eq("job_id", jobId);
    check(
      "a calendar sync row was enqueued",
      (queue ?? []).some((q) => q.integration === "calendar"),
      JSON.stringify(queue)
    );

    // after() runs once the response is sent, so give it a moment.
    let eventId = null;
    for (let attempt = 0; attempt < 10 && !eventId; attempt++) {
      await new Promise((r) => setTimeout(r, 1500));
      const { data } = await admin.from("jobs").select("visit_event_id").eq("id", jobId).single();
      eventId = data?.visit_event_id ?? null;
    }
    check("the job reached Google Calendar", Boolean(eventId), "no visit_event_id after 15s");
    transcript.push({ note: "calendar", job_id: jobId, visit_event_id: eventId });
  }

  // 10 — reschedule -----------------------------------------------------------
  console.log("\nReschedule");
  const laterAvailability = await call("GET", "/api/booking/availability");
  const stillFree = (laterAvailability.body?.bookable ?? []).find(
    (s) => !(s.date === slotA.date && s.slot === slotA.slot)
  );

  if (stillFree) {
    const moved = await call("POST", "/api/booking/reschedule", {
      body: {
        job_id: created.body?.booking?.job_id,
        visit_date: stillFree.date,
        visit_time: stillFree.slot,
        reason: "Smoke test",
      },
    });
    check("the visit moves", moved.status === 200 && moved.body?.status === "rescheduled", JSON.stringify(moved.body).slice(0, 300));
    check("the old slot is reported back", moved.body?.previous?.visit_date === slotA.date);

    const again = await call("POST", "/api/booking/reschedule", {
      body: { job_id: created.body?.booking?.job_id, visit_date: stillFree.date, visit_time: stillFree.slot },
    });
    check("rescheduling to the same slot is a no-op, not an error", again.body?.status === "unchanged");
  }

  const missing = await call("POST", "/api/booking/reschedule", {
    body: { job_id: "00000000-0000-0000-0000-000000000000", visit_date: slotA.date, visit_time: slotA.slot },
  });
  check("an unknown job is 404", missing.status === 404 && missing.body?.error === "job_not_found");

  // 11 — cancel ---------------------------------------------------------------
  console.log("\nCancel");
  const cancelled = await call("POST", "/api/booking/cancel", {
    body: { job_id: created.body?.booking?.job_id, reason: "Smoke test cleanup" },
  });
  check("cancelling works", cancelled.status === 200 && cancelled.body?.status === "cancelled", JSON.stringify(cancelled.body).slice(0, 300));
  check("the visit date is cleared so the event comes off the calendar", cancelled.body?.booking?.visit_date === null);

  const cancelAgain = await call("POST", "/api/booking/cancel", {
    body: { job_id: created.body?.booking?.job_id },
  });
  check("cancelling twice settles rather than fails", cancelAgain.status === 200 && cancelAgain.body?.status === "already_cancelled");

  // ── Clean up ---------------------------------------------------------------
  console.log("\nCleanup");
  for (const jobId of createdJobIds) {
    if (jobId === created.body?.booking?.job_id) continue;
    await call("POST", "/api/booking/cancel", { body: { job_id: jobId, reason: "Smoke test cleanup" } });
  }
  console.log(`  cancelled ${createdJobIds.size} test job(s)`);

  if (PURGE && admin) {
    // Cancel already took the calendar events down; this only removes the rows.
    await new Promise((r) => setTimeout(r, 5000));
    const ids = [...createdJobIds];
    await admin.from("job_activity").delete().in("job_id", ids);
    await admin.from("sync_queue").delete().in("job_id", ids);
    const { error } = await admin.from("jobs").delete().in("id", ids);
    console.log(error ? `  purge failed: ${error.message}` : `  purged ${ids.length} job row(s)`);
  } else if (PURGE) {
    console.log("  --purge needs SUPABASE_SERVICE_ROLE_KEY; skipped");
  } else {
    console.log("  test jobs left in place, cancelled. Re-run with --purge to delete them.");
  }

  if (OUT) {
    fs.mkdirSync(new URL(".", new URL(OUT, `file://${process.cwd()}/`)), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(transcript, null, 2));
    console.log(`\nTranscript written to ${OUT}`);
  }
}

main()
  .then(() => {
    console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

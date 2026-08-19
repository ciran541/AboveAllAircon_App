/**
 * lib/availability.test.ts
 *
 * Unit tests for the availability rules. No database, no network — every
 * input is a literal, which is the reason lib/availability.ts is written as
 * pure functions in the first place.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  AVAILABILITY_HORIZON_DAYS,
  DAILY_APPOINTMENT_CAPACITY,
  MIN_LEAD_HOURS,
  SITE_VISIT_SLOTS,
  SLOT_CAPACITY,
  WORKING_WEEKDAYS,
  closesWholeDay,
  businessNow,
  capacityAppointments,
  computeAvailability,
  defaultAvailabilityRange,
  earliestBookable,
  fromWallClockMinutes,
  isCapacityConsuming,
  normalizeTime,
  occupancyByDate,
  slotForTime,
  type CalendarBlock,
  type CapacityJob,
  type DayAvailability,
} from "@/lib/availability";

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** 2026-08-19 is a Wednesday; 2026-08-23 is a Sunday. */
const NOW = { date: "2026-08-19", time: "09:00" };

let nextId = 0;
function job(overrides: Partial<CapacityJob> = {}): CapacityJob {
  nextId += 1;
  return {
    id: `job-${nextId}`,
    stage: "Site Visit Scheduled",
    status: "open",
    ...overrides,
  } as CapacityJob;
}

function dayFor(days: DayAvailability[], date: string): DayAvailability {
  const found = days.find((d) => d.date === date);
  assert.ok(found, `no availability computed for ${date}`);
  return found;
}

function slotState(days: DayAvailability[], date: string, slot: string) {
  const found = dayFor(days, date).slots.find((s) => s.slot === slot);
  assert.ok(found, `no slot ${slot} on ${date}`);
  return found;
}

/** Availability over a window well clear of the lead-time boundary. */
function availability(jobs: CapacityJob[], extra: Partial<Parameters<typeof computeAvailability>[0]> = {}) {
  return computeAvailability({
    from: "2026-08-21",
    to: "2026-08-25",
    jobs,
    now: NOW,
    ...extra,
  });
}

// ── The published vocabulary ──────────────────────────────────────────────────

test("the slot vocabulary is exactly what the API contract promises", () => {
  // docs/booking-api.md, the assistant's adapter and the customer-facing
  // knowledge base ("10am-8pm, Mon-Sat") are all written against these values.
  // Changing one is a contract change, and should fail here first.
  assert.deepEqual(
    SITE_VISIT_SLOTS.map((s) => [s.id, s.label, s.windowStart, s.windowEnd, s.capacity]),
    [
      ["10:00", "10am–11am", "10:00", "11:00", 2],
      ["11:00", "11am–12pm", "11:00", "12:00", 2],
      ["12:00", "12pm–1pm", "12:00", "13:00", 2],
      ["13:00", "1pm–2pm", "13:00", "14:00", 2],
      ["14:00", "2pm–3pm", "14:00", "15:00", 2],
      ["15:00", "3pm–4pm", "15:00", "16:00", 2],
      ["16:00", "4pm–5pm", "16:00", "17:00", 2],
      ["17:00", "5pm–6pm", "17:00", "18:00", 2],
      ["18:00", "6pm–7pm", "18:00", "19:00", 2],
      ["19:00", "7pm–8pm", "19:00", "20:00", 2],
    ]
  );
  assert.deepEqual(WORKING_WEEKDAYS, [1, 2, 3, 4, 5, 6]); // Mon-Sat
  assert.equal(SLOT_CAPACITY, 2);
  assert.equal(DAILY_APPOINTMENT_CAPACITY, 8);
  assert.equal(MIN_LEAD_HOURS, 3);
  assert.equal(AVAILABILITY_HORIZON_DAYS, 14);
});

test("the grid matches the 10am-8pm promise made to customers", () => {
  // The knowledge base tells customers visits run 10am-8pm. The first slot
  // must therefore start at 10:00 and the last must *end* at 20:00 — an
  // earlier last slot is the contradiction this grid exists to remove.
  assert.equal(SITE_VISIT_SLOTS[0].windowStart, "10:00");
  assert.equal(SITE_VISIT_SLOTS[SITE_VISIT_SLOTS.length - 1].windowEnd, "20:00");
  assert.equal(SITE_VISIT_SLOTS[SITE_VISIT_SLOTS.length - 1].label, "7pm–8pm");
});

test("the slot windows are contiguous, so no appointment falls between them", () => {
  for (let i = 1; i < SITE_VISIT_SLOTS.length; i++) {
    assert.equal(
      SITE_VISIT_SLOTS[i].windowStart,
      SITE_VISIT_SLOTS[i - 1].windowEnd,
      `gap between ${SITE_VISIT_SLOTS[i - 1].id} and ${SITE_VISIT_SLOTS[i].id}`
    );
  }
  // And every slot id sits inside its own window.
  for (const slot of SITE_VISIT_SLOTS) {
    assert.equal(slotForTime(slot.id)?.id, slot.id);
  }
});

// ── Time bucketing ────────────────────────────────────────────────────────────

test("normalizeTime pads and rejects", () => {
  assert.equal(normalizeTime("9:00"), "09:00");
  assert.equal(normalizeTime(" 9:5 "), "09:05");
  assert.equal(normalizeTime("09:00:00"), "09:00");
  assert.equal(normalizeTime("13:45"), "13:45");
  assert.equal(normalizeTime(""), null);
  assert.equal(normalizeTime(null), null);
  assert.equal(normalizeTime("tomorrow"), null);
  assert.equal(normalizeTime("25:00"), null);
});

test("every time a human has actually booked floors onto the right hour", () => {
  // Every distinct visit_time value in the jobs table, with its row count.
  const expected: Record<string, string | null> = {
    "10:00": "10:00", // 22 rows
    "10:30": "10:00",
    "11:00": "11:00", // 38 rows — the most common time in the table
    "11:30": "11:00",
    "12:00": "12:00", // 12 rows
    "13:00": "13:00", // 33 rows
    "14:00": "14:00", // 29 rows
    "14:30": "14:00",
    "15:00": "15:00", // 20 rows
    "15:15": "15:00",
    "15:30": "15:00",
    "15:45": "15:00",
    "16:00": "16:00", // 8 rows
    "16:30": "16:00",
    "17:00": "17:00", // 7 rows
    "17:30": "17:00",
    "18:00": "18:00",
    "18:30": "18:00",
    "19:00": "19:00",
    "19:30": "19:00", // the latest visit ever booked
    // Outside the offered grid: 17 rows in total. They belong to no slot, and
    // are counted against the day only — real work nobody can be sold over,
    // but not a time this API will ever offer.
    "09:00": null,
    "09:30": null,
    "00:00": null,
  };

  for (const [time, slot] of Object.entries(expected)) {
    assert.equal(slotForTime(time)?.id ?? null, slot, `${time} should map to ${slot}`);
  }
  assert.equal(slotForTime(null), null);
  assert.equal(slotForTime("20:00"), null); // the close of business
});

// ── What consumes capacity ────────────────────────────────────────────────────

test("a lost or closed job does not consume capacity", () => {
  assert.equal(isCapacityConsuming(job()), true);
  assert.equal(isCapacityConsuming(job({ status: "closed" })), false);
  assert.equal(isCapacityConsuming(job({ loss_reason: "Too expensive" })), false);
  assert.equal(isCapacityConsuming(job({ closed_at: "2026-08-01T10:00:00Z" })), false);
  // A blank loss_reason is not a loss — the column holds '' in places.
  assert.equal(isCapacityConsuming(job({ loss_reason: "  " })), true);
  // status is null on nothing today, but the column is nullable.
  assert.equal(isCapacityConsuming(job({ status: null })), true);
});

test("occupancy counts jobs and second visits, not just site visits", () => {
  const jobs = [
    job({ visit_date: "2026-08-21", visit_time: "10:00" }),
    job({ job_date: "2026-08-21", job_time: "13:00" }),
    job({ second_visit_date: "2026-08-21", second_visit_time: "15:00" }),
  ];

  const occupancy = occupancyByDate(capacityAppointments(jobs));
  const day = occupancy.get("2026-08-21");

  assert.equal(day?.total, 3);
  assert.equal(day?.bySlot.get("10:00"), 1);
  assert.equal(day?.bySlot.get("13:00"), 1);
  assert.equal(day?.bySlot.get("15:00"), 1);
});

test("one job with all three slots on one day counts three times", () => {
  const jobs = [
    job({
      visit_date: "2026-08-21",
      visit_time: "10:00",
      job_date: "2026-08-21",
      job_time: "13:00",
      second_visit_date: "2026-08-21",
      second_visit_time: "15:00",
    }),
  ];

  assert.equal(capacityAppointments(jobs).length, 3);
});

test("an installation eats into the survey slot it sits in, and a second fills it", () => {
  // Capacity is 2, so one installation leaves room for one survey — which is
  // the whole reason it isn't 1: 109 installations start at exactly 10:00, and
  // a capacity of 1 would close the 10am slot on nearly every working day.
  const one = availability([job({ job_date: "2026-08-21", job_time: "13:30" })]);
  assert.equal(slotState(one, "2026-08-21", "13:00").available, true);
  assert.equal(slotState(one, "2026-08-21", "13:00").remaining, 1);

  const two = availability([
    job({ job_date: "2026-08-21", job_time: "13:30" }),
    job({ job_date: "2026-08-21", job_time: "13:00" }),
  ]);
  assert.equal(slotState(two, "2026-08-21", "13:00").available, false);
  assert.equal(slotState(two, "2026-08-21", "13:00").reason, "slot_full");
  // 13:30 floors onto 13:00 and touches nothing else.
  assert.equal(slotState(two, "2026-08-21", "14:00").available, true);
});

// ── Calendar removals ─────────────────────────────────────────────────────────

/** Two jobs on one slot — enough to fill it at capacity 2. */
function fullSlot(date: string, time: string) {
  return [
    job({ id: "j1", visit_date: date, visit_time: time }),
    job({ id: "j2", visit_date: date, visit_time: time }),
  ];
}

test("a slot someone deleted in Calendar gives its capacity back", () => {
  const booked = fullSlot("2026-08-21", "10:00");

  const withoutRemoval = availability(booked);
  assert.equal(slotState(withoutRemoval, "2026-08-21", "10:00").available, false);

  const withRemoval = availability(booked, {
    removals: [{ job_id: "j1", event_type: "site_visit", slot_date: "2026-08-21" }],
  });
  assert.equal(slotState(withRemoval, "2026-08-21", "10:00").available, true);
  assert.equal(slotState(withRemoval, "2026-08-21", "10:00").remaining, 1);
});

test("a removal recorded against another date does not free the slot", () => {
  // The job was rescheduled after the deletion, which is a fresh statement
  // that it is happening — the same rule removalApplies() uses in syncProcessor.
  const days = availability(fullSlot("2026-08-21", "10:00"), {
    removals: [{ job_id: "j1", event_type: "site_visit", slot_date: "2026-08-18" }],
  });

  assert.equal(slotState(days, "2026-08-21", "10:00").available, false);
});

test("a removal only frees the slot type it was recorded against", () => {
  const days = availability(
    [
      job({
        id: "j1",
        visit_date: "2026-08-21",
        visit_time: "10:00",
        job_date: "2026-08-21",
        job_time: "13:00",
      }),
      job({ id: "j2", visit_date: "2026-08-21", visit_time: "10:00" }),
      job({ id: "j3", job_date: "2026-08-21", job_time: "13:00" }),
    ],
    { removals: [{ job_id: "j1", event_type: "site_visit", slot_date: "2026-08-21" }] }
  );

  // j1's site visit is off the calendar, so 10:00 has room again...
  assert.equal(slotState(days, "2026-08-21", "10:00").available, true);
  // ...but its installation is untouched, and 13:00 stays full.
  assert.equal(slotState(days, "2026-08-21", "13:00").available, false);
});

// ── Capacity ceilings ─────────────────────────────────────────────────────────

test("a cancelled booking frees the slot it held", () => {
  const days = availability([
    job({ visit_date: "2026-08-21", visit_time: "10:00" }),
    job({
      visit_date: "2026-08-21",
      visit_time: "10:00",
      status: "closed",
      loss_reason: "Cancelled by customer",
      closed_at: "2026-08-19T02:00:00Z",
    }),
  ]);

  assert.equal(slotState(days, "2026-08-21", "10:00").available, true);
  assert.equal(slotState(days, "2026-08-21", "10:00").remaining, 1);
});

test("the day fills before the slots do when other work owns the day", () => {
  // Eight installations all starting at 10:00: that hour is full on its own
  // count, and the day ceiling closes everything else. Eight is the busiest
  // day this team has ever actually worked.
  const jobs = Array.from({ length: DAILY_APPOINTMENT_CAPACITY }, () =>
    job({ job_date: "2026-08-21", job_time: "10:00" })
  );

  const days = availability(jobs);
  assert.equal(slotState(days, "2026-08-21", "10:00").reason, "slot_full");
  assert.equal(slotState(days, "2026-08-21", "13:00").reason, "day_full");
  assert.equal(slotState(days, "2026-08-21", "19:00").reason, "day_full");

  // One short of the ceiling, the rest of the day is still sellable.
  const nearly = availability(jobs.slice(0, DAILY_APPOINTMENT_CAPACITY - 1));
  assert.equal(slotState(nearly, "2026-08-21", "13:00").available, true);
});

test("untimed and out-of-hours appointments count against the day, not a slot", () => {
  const jobs = Array.from({ length: DAILY_APPOINTMENT_CAPACITY - 1 }, () =>
    job({ job_date: "2026-08-21", job_time: null })
  );

  const days = availability(jobs);
  // One under the day ceiling, so every slot is still sellable.
  assert.equal(slotState(days, "2026-08-21", "13:00").available, true);

  const full = availability([...jobs, job({ job_date: "2026-08-21", job_time: null })]);
  assert.equal(slotState(full, "2026-08-21", "13:00").reason, "day_full");

  // A 09:30 visit — outside the offered grid, but still someone's morning.
  const early = availability([
    ...jobs,
    job({ visit_date: "2026-08-21", visit_time: "09:30" }),
  ]);
  assert.equal(slotState(early, "2026-08-21", "10:00").reason, "day_full");
});

// ── Calendar rules ────────────────────────────────────────────────────────────

test("Sunday is never offered", () => {
  const days = availability([]);
  const sunday = dayFor(days, "2026-08-23");

  assert.equal(sunday.weekday, 0);
  assert.equal(sunday.workingDay, false);
  assert.ok(sunday.slots.every((s) => !s.available && s.reason === "non_working_day"));

  assert.equal(dayFor(days, "2026-08-22").workingDay, true); // Saturday is
});

test("a blackout date closes the whole day and says why", () => {
  const days = availability([], {
    blackouts: [{ date: "2026-08-21", reason: "National Day observed" }],
  });

  const day = dayFor(days, "2026-08-21");
  assert.equal(day.blackoutReason, "National Day observed");
  assert.ok(day.slots.every((s) => !s.available && s.reason === "blackout"));
});

test("nothing inside the lead time is offered, but the same day still is", () => {
  // Now is Wednesday 09:00 and the lead is 3 hours, so noon today is on. This
  // is the point of the short lead: a lead who messages at 9am can be seen
  // before lunch instead of tomorrow.
  const days = computeAvailability({
    from: "2026-08-19",
    to: "2026-08-20",
    jobs: [],
    now: NOW,
  });

  assert.equal(slotState(days, "2026-08-19", "11:00").reason, "past_lead_time");
  assert.equal(slotState(days, "2026-08-19", "12:00").available, true);
  assert.equal(slotState(days, "2026-08-20", "10:00").available, true);
});

test("the lead-time boundary moves with the time of day", () => {
  // 17:30 on Wednesday: 20:00 would be the boundary, and the last slot starts
  // at 19:00, so nothing is left today — but tomorrow opens normally.
  const days = computeAvailability({
    from: "2026-08-19",
    to: "2026-08-20",
    jobs: [],
    now: { date: "2026-08-19", time: "17:30" },
  });

  assert.ok(dayFor(days, "2026-08-19").slots.every((s) => s.reason === "past_lead_time"));
  assert.equal(slotState(days, "2026-08-20", "10:00").available, true);
});

test("nothing past the horizon is offered", () => {
  const days = computeAvailability({
    from: "2026-09-01",
    to: "2026-09-04",
    jobs: [],
    now: NOW,
  });

  // Horizon is 14 days from 2026-08-19, i.e. through 2026-09-02.
  assert.equal(slotState(days, "2026-09-02", "10:00").available, true);
  assert.equal(slotState(days, "2026-09-03", "10:00").reason, "beyond_horizon");
});

test("the default range runs from the lead-time boundary to the horizon", () => {
  // 09:00 + 3h is still today, so today is in the window.
  assert.deepEqual(defaultAvailabilityRange(NOW), { from: "2026-08-19", to: "2026-09-02" });
  // Late enough in the evening, the boundary rolls into tomorrow.
  assert.deepEqual(defaultAvailabilityRange({ date: "2026-08-19", time: "22:30" }), {
    from: "2026-08-20",
    to: "2026-09-02",
  });
});

// ── Clock arithmetic ──────────────────────────────────────────────────────────

test("earliestBookable crosses midnight correctly", () => {
  assert.deepEqual(earliestBookable({ date: "2026-08-19", time: "16:00" }), {
    date: "2026-08-19",
    time: "19:00",
  });
  assert.deepEqual(earliestBookable({ date: "2026-08-31", time: "23:30" }), {
    date: "2026-09-01",
    time: "02:30",
  });
  assert.deepEqual(earliestBookable({ date: "2026-08-19", time: "09:00" }, 0), {
    date: "2026-08-19",
    time: "09:00",
  });
  assert.deepEqual(earliestBookable({ date: "2026-08-19", time: "09:00" }, 24), {
    date: "2026-08-20",
    time: "09:00",
  });
});

test("fromWallClockMinutes round-trips", () => {
  assert.deepEqual(fromWallClockMinutes(0), { date: "1970-01-01", time: "00:00" });
});

test("businessNow reads Singapore's date, not the server's", () => {
  // 17:30 UTC is already the next day in Singapore. Using
  // toISOString().slice(0,10) here would return 2026-08-19 and offer a slot
  // that is already inside the lead-time window.
  assert.deepEqual(businessNow(new Date("2026-08-19T17:30:00Z")), {
    date: "2026-08-20",
    time: "01:30",
  });
  assert.deepEqual(businessNow(new Date("2026-08-19T16:00:00Z")), {
    date: "2026-08-20",
    time: "00:00",
  });
  assert.deepEqual(businessNow(new Date("2026-08-19T01:00:00Z")), {
    date: "2026-08-19",
    time: "09:00",
  });
});

// ── Shape ─────────────────────────────────────────────────────────────────────

test("every day in the range comes back, with every slot", () => {
  const days = availability([]);

  assert.deepEqual(
    days.map((d) => d.date),
    ["2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25"]
  );
  assert.deepEqual(
    days[0].slots.map((s) => s.slot),
    ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"]
  );
  assert.equal(days[0].slots[0].label, "10am–11am");
  assert.equal(days[0].slots[9].label, "7pm–8pm");
});

test("an unavailable slot never reports remaining capacity", () => {
  const days = availability(fullSlot("2026-08-21", "10:00"));
  const taken = slotState(days, "2026-08-21", "10:00");

  assert.equal(taken.available, false);
  assert.equal(taken.remaining, 0);
});

// ── Manual Google Calendar entries ────────────────────────────────────────────

function block(overrides: Partial<CalendarBlock> = {}): CalendarBlock {
  nextId += 1;
  return {
    id: `evt-${nextId}`,
    date: "2026-08-21",
    time: "10:00",
    wholeDay: false,
    summary: "Reserve 3 men first trip piping",
    ...overrides,
  };
}

test("work typed straight into Google Calendar consumes the slot it sits in", () => {
  // 39 events over a 135-day window were entered directly in Calendar and have
  // no job row at all. Availability that ignored them would sell over them.
  const one = availability([], { blocks: [block({ time: "14:30" })] });
  assert.equal(slotState(one, "2026-08-21", "14:00").available, true);
  assert.equal(slotState(one, "2026-08-21", "14:00").remaining, 1);

  const two = availability([], {
    blocks: [block({ time: "14:30" }), block({ time: "14:00" })],
  });
  // Reported as a calendar block, not slot_full: the office would otherwise go
  // looking for a job that doesn't exist.
  assert.equal(slotState(two, "2026-08-21", "14:00").reason, "calendar_block");
});

test("a manual entry and a job share a slot's capacity", () => {
  const days = availability([job({ visit_date: "2026-08-21", visit_time: "10:15" })], {
    blocks: [block({ time: "10:45" })],
  });

  assert.equal(slotState(days, "2026-08-21", "10:00").reason, "calendar_block");
});

test("manual entries count against the day ceiling too", () => {
  const blocks = Array.from({ length: DAILY_APPOINTMENT_CAPACITY }, (_, i) =>
    block({ time: `1${i % 2}:00` })
  );
  const days = availability([], { blocks });

  assert.equal(slotState(days, "2026-08-21", "17:00").reason, "day_full");
});

test("a tagged entry closes the whole day and says which one", () => {
  const days = availability([], {
    blocks: [block({ wholeDay: true, time: null, summary: "[Leave] Jason" })],
  });

  const day = dayFor(days, "2026-08-21");
  assert.equal(day.calendarBlockReason, "[Leave] Jason");
  assert.ok(day.slots.every((s) => !s.available && s.reason === "calendar_block"));
  // The next day is untouched.
  assert.ok(dayFor(days, "2026-08-22").slots.some((s) => s.available));
});

test("an all-day entry without a tag is one job, not a closed day", () => {
  // Every all-day event this team has ever created is a job with no fixed
  // time. Treating all-day as leave would have shut five workable days in
  // three months.
  const days = availability([], {
    blocks: [
      block({ time: null, summary: "Servicing anytime before 8pm. 1 Bukit Batok crescent" }),
    ],
  });

  assert.equal(dayFor(days, "2026-08-21").calendarBlockReason, undefined);
  assert.ok(dayFor(days, "2026-08-21").slots.every((s) => s.available));
});

test("only a bracketed tag closes a day", () => {
  // Real titles from this calendar — none may close a day.
  for (const title of [
    "Servicing anytime before 8pm. 1 Bukit Batok crescent #03-24",
    "Check wire.One North Residences 9 One-North Gateway, #08-57",
    "Shift ac center. Blk 711 woodlands drive 70 #03-71 S730711",
    "Silicon all holes. 7 Ontario Avenue, Blk 7 #03-05 S576196",
    "Checking. Not cold. 17 Hazel park terrace #03-09.",
    "[Job · Resale] Block 231 Bukit Batok East Ave 5 #01-85 S650231",
    "Leave keys at the guardhouse",
    "Reserve for 98213739",
  ]) {
    assert.equal(closesWholeDay(title), false, title);
  }

  for (const title of ["[Leave] Jackie", "[PH] National Day", "[Closed]", "[off] stocktake", "[Blocked] renovation"]) {
    assert.equal(closesWholeDay(title), true, title);
  }
  assert.equal(closesWholeDay(null), false);
});

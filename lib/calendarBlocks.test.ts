/**
 * lib/calendarBlocks.test.ts
 *
 * Tests the mapping from a Google event to the capacity it occupies. No
 * network: the events below are the shapes listCalendarEvents returns, several
 * of them copied verbatim from this business's calendar.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { calendarEventToBlocks } from "@/lib/calendarBlocks";
import type { ListedEvent } from "@/lib/googleCalendar";

const FROM = "2026-08-17";
const TO = "2026-08-31";

function map(event: ListedEvent, id = "evt-1") {
  return calendarEventToBlocks(id, event, FROM, TO);
}

test("a timed entry lands on its own date and time in Singapore", () => {
  // 02:00Z is 10:00 in Singapore — the hour this team starts almost everything.
  const blocks = map({
    status: "confirmed",
    startDateTime: "2026-08-20T02:00:00Z",
    summary: "Reserve 3 men first trip piping for 90180569",
  });

  assert.deepEqual(blocks, [
    {
      id: "evt-1",
      date: "2026-08-20",
      time: "10:00",
      wholeDay: false,
      summary: "Reserve 3 men first trip piping for 90180569",
    },
  ]);
});

test("a timed entry late enough to roll the UTC date still books the right day", () => {
  // 16:30Z on the 19th is already 00:30 on the 20th in Singapore. Anything
  // that derived the date from the UTC instant would block the wrong day —
  // the same trap todayInBusinessTz() exists to avoid.
  const blocks = map({ status: "confirmed", startDateTime: "2026-08-19T16:30:00Z" });
  assert.equal(blocks[0].date, "2026-08-20");
  assert.equal(blocks[0].time, "00:30");
});

test("a single all-day entry covers exactly one day", () => {
  // Google's end.date is exclusive: one day of anything comes back as 20 -> 21.
  const blocks = map({
    status: "confirmed",
    startDate: "2026-08-20",
    endDate: "2026-08-21",
    summary: "Servicing anytime before 8pm. 1 Bukit Batok crescent #03-24",
  });

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].date, "2026-08-20");
  assert.equal(blocks[0].time, null);
  // Untagged, so it is one job that day — not a closed day.
  assert.equal(blocks[0].wholeDay, false);
});

test("a multi-day leave entry blocks every day it covers", () => {
  const blocks = map({
    status: "confirmed",
    startDate: "2026-08-24",
    endDate: "2026-08-27",
    summary: "[Leave] Jason",
  });

  assert.deepEqual(
    blocks.map((b) => b.date),
    ["2026-08-24", "2026-08-25", "2026-08-26"]
  );
  assert.ok(blocks.every((b) => b.wholeDay));
  // One block per day, each distinct, so they can't collapse into each other.
  assert.equal(new Set(blocks.map((b) => b.id)).size, 3);
});

test("an all-day entry is clipped to the window asked for", () => {
  const blocks = map({
    status: "confirmed",
    startDate: "2026-08-10",
    endDate: "2026-09-10",
    summary: "[Closed] renovation",
  });

  assert.equal(blocks[0].date, FROM);
  assert.equal(blocks[blocks.length - 1].date, TO);
});

test("a timed entry outside the window is dropped", () => {
  assert.deepEqual(map({ status: "confirmed", startDateTime: "2026-09-20T02:00:00Z" }), []);
  assert.deepEqual(map({ status: "confirmed", startDateTime: "2026-07-01T02:00:00Z" }), []);
});

test("an event with no start at all is ignored rather than guessed at", () => {
  assert.deepEqual(map({ status: "confirmed" }), []);
});

test("a tagged timed entry closes the day it falls on", () => {
  const blocks = map({
    status: "confirmed",
    startDateTime: "2026-08-20T02:00:00Z",
    summary: "[PH] National Day observed",
  });

  assert.equal(blocks[0].wholeDay, true);
  // A day-closing entry has no hour: it isn't occupying one, it's taking them all.
  assert.equal(blocks[0].time, null);
});

test("a titleless event still counts, it just can't explain itself", () => {
  const blocks = map({ status: "confirmed", startDateTime: "2026-08-20T06:00:00Z" });
  assert.equal(blocks[0].summary, null);
  assert.equal(blocks[0].time, "14:00");
});

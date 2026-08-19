/**
 * lib/calendarBlocks.ts
 *
 * Reads the Google Calendar itself, so availability accounts for work this app
 * has never heard of.
 *
 * This is not a theoretical gap. Over a 135-day window the calendar holds 39
 * events that no job row created — "Reserve 3 men first trip piping for
 * 90180569", "Jackie save for urgent", "Book Randy. Sys 2 second hand." — plus
 * all-day entries like "Servicing anytime before 8pm". Availability computed
 * from the jobs table alone sells straight over every one of them. The same
 * team habit is why calendar_slot_removals exists.
 *
 * Three rules make the arithmetic honest:
 *
 *   1. Events this app created are excluded by event id. They are already
 *      counted from the jobs table, and counting them twice would make a day
 *      look full at half capacity.
 *   2. Cancelled events are skipped. listCalendarEvents passes showDeleted so
 *      reconciliation can see soft-deleted events; a cancelled event is not a
 *      block.
 *   3. Recurring series are expanded (singleEvents), or a weekly block would
 *      only ever be visible on its first date.
 *
 * And two rules keep it from doing harm:
 *
 *   - It fails open. If Google is slow or down, availability falls back to
 *     jobs-only rather than refusing to book. An outage that stops every
 *     booking is worse than a rare double-book an admin can fix by phone —
 *     but it is not silent: it alerts through the same rail as sync failures.
 *   - It caches. The assistant asks for availability several times per
 *     conversation, and each ask is otherwise a Google round trip.
 */

import { listCalendarEvents, type ListedEvent } from "@/lib/googleCalendar";
import { BUSINESS_TZ, addDays } from "@/lib/appointments";
import { closesWholeDay, type CalendarBlock } from "@/lib/availability";
import { clearCalendarBlockAlert, maybeSendCalendarBlockAlert } from "@/lib/alertMail";

/** How long a fetched window stays fresh. */
const CACHE_TTL_MS = 5 * 60_000;
/**
 * How long a stale window may still be used when Google is failing. Serving
 * blocks that are up to an hour old is much closer to the truth than serving
 * none at all.
 */
const STALE_MAX_MS = 60 * 60_000;

type CacheEntry = { fetchedAt: number; events: Map<string, ListedEvent> };

/**
 * Runs work after the response, when there is a response to be after.
 *
 * next/server is imported dynamically rather than at the top of the file so
 * this module can be imported by the unit tests, which run in plain Node where
 * that import doesn't resolve. The mapping below is worth testing; needing a
 * bundler to do it isn't.
 */
async function afterResponse(task: () => unknown): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(task);
  } catch {
    // Outside a Next request — a script, or a test. Nothing to defer to.
  }
}

/**
 * Keyed on the date window only, never on the excluded ids: the raw Google
 * response is what's cached, and the job event ids are filtered out fresh on
 * every call. A booking made 10 seconds ago is therefore excluded immediately
 * instead of being double-counted until the cache expires.
 */
const cache = new Map<string, CacheEntry>();

export interface CalendarBlockResult {
  blocks: CalendarBlock[];
  /** True when Google could not be read and availability is jobs-only. */
  degraded: boolean;
  /** True when the blocks came from an expired cache because Google failed. */
  stale: boolean;
  error?: string;
}

/** Local midnight in Singapore, as the RFC3339 instant Google wants. */
function businessDayStart(date: string): string {
  // The offset is fixed: Singapore has had no DST since 1935 and no plans for
  // any. buildStartEnd() in lib/googleCalendar.ts makes the same assumption.
  return `${date}T00:00:00+08:00`;
}

function businessParts(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` };
}

/**
 * Turns one Google event into the blocks it occupies.
 *
 * An all-day event yields one block per day it covers — Google's end.date is
 * exclusive, so a single day of leave comes back as 20th → 21st. A tagged
 * closure yields whole-day blocks; anything else yields an untimed block,
 * which consumes one unit of the day's capacity exactly like an untimed job.
 */
export function calendarEventToBlocks(
  id: string,
  event: ListedEvent,
  from: string,
  to: string
): CalendarBlock[] {
  const wholeDay = closesWholeDay(event.summary);
  const summary = event.summary?.trim() || null;

  if (event.startDate) {
    const blocks: CalendarBlock[] = [];
    const last = event.endDate && event.endDate > event.startDate
      ? addDays(event.endDate, -1)
      : event.startDate;
    for (
      let date = event.startDate;
      date <= last && date <= to;
      date = addDays(date, 1)
    ) {
      if (date < from) continue;
      blocks.push({ id: `${id}:${date}`, date, time: null, wholeDay, summary });
      // A multi-year all-day event would otherwise walk forever.
      if (blocks.length > 400) break;
    }
    return blocks;
  }

  if (!event.startDateTime) return [];
  const { date, time } = businessParts(event.startDateTime);
  if (date < from || date > to) return [];
  return [{ id, date, time: wholeDay ? null : time, wholeDay, summary }];
}

async function fetchWindow(from: string, to: string): Promise<Map<string, ListedEvent>> {
  return listCalendarEvents(businessDayStart(from), {
    // Exclusive upper bound: midnight at the start of the day after `to`.
    timeMaxIso: businessDayStart(addDays(to, 1)),
    singleEvents: true,
  });
}

/**
 * Manual calendar entries in [from, to], with everything this app created
 * filtered out.
 *
 * Never throws. A failure returns `degraded: true` and whatever it could
 * salvage, and fires an alert once per problem rather than once per request.
 */
export async function loadCalendarBlocks(
  from: string,
  to: string,
  knownEventIds: ReadonlySet<string>
): Promise<CalendarBlockResult> {
  const key = `${from}|${to}`;
  const cached = cache.get(key);
  const now = Date.now();

  let events: Map<string, ListedEvent>;
  let stale = false;

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    events = cached.events;
  } else {
    try {
      events = await fetchWindow(from, to);
      cache.set(key, { fetchedAt: now, events });
      // Only on a real fetch, so the all-clear check costs one small query per
      // cache miss rather than one per request.
      void afterResponse(() => clearCalendarBlockAlert());
      // Bound the cache — one entry per distinct window the assistant asks for.
      if (cache.size > 32) {
        for (const [k, v] of cache) {
          if (now - v.fetchedAt > STALE_MAX_MS) cache.delete(k);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[calendarBlocks] Google Calendar read failed:", message);

      // after() so a degraded availability response still goes out at full
      // speed; the alert is best-effort and de-duplicated downstream.
      void afterResponse(() => maybeSendCalendarBlockAlert(message));


      if (cached && now - cached.fetchedAt < STALE_MAX_MS) {
        events = cached.events;
        stale = true;
      } else {
        return { blocks: [], degraded: true, stale: false, error: message };
      }
    }
  }

  const blocks: CalendarBlock[] = [];
  for (const [id, event] of events) {
    if (event.status === "cancelled") continue;
    if (knownEventIds.has(id)) continue;
    blocks.push(...calendarEventToBlocks(id, event, from, to));
  }

  return { blocks, degraded: false, stale };
}

/** Drops the cache. Only for tests and scripts. */
export function clearCalendarBlockCache(): void {
  cache.clear();
}

# Booking API — for the AI sales assistant (`AA_AI`)

Everything the assistant's adapter needs. This app stays the only owner of
Google Calendar: the assistant creates a job through these endpoints, and the
existing `enqueue_sync` → `syncProcessor` chain puts it on the calendar. The
assistant never holds Google credentials and never writes to Calendar.

Nothing about the existing calendar sync, reconciliation or alerting changed.

---

## 1. Base URLs

| Environment | Base URL |
|---|---|
| Production | `<PRODUCTION_BASE_URL>` |
| Staging / preview | `<STAGING_BASE_URL>` |

Point the adapter at staging while you build. A booking made against production
creates a real job, a real customer and a real Google Calendar event that a real
engineer will see.

Locally: `npm run dev` serves the same routes at `http://localhost:3000`.

## 2. Auth

Every route takes a shared secret in a bearer header:

```http
Authorization: Bearer <BOOKING_API_SECRET>
```

- Env var: **`BOOKING_API_SECRET`** (this repo's `.env.local`, and the same
  variable in the Vercel project settings).
- Deliberately **not** `CRON_SECRET`. Rotating the assistant's key must not
  disable the daily calendar-sync safety net, and a leaked cron secret must not
  be able to create jobs.
- Compared in constant time. A wrong secret is `401`; an unset secret on the
  deployment is `503 not_configured` — a missing env var looks broken rather
  than open.

## 3. Formats

| | |
|---|---|
| Timezone | `Asia/Singapore` for every date and time, in and out |
| Dates | `YYYY-MM-DD` |
| Times | 24-hour `HH:MM` |
| Timestamps (`created_at`) | ISO 8601 UTC, as Postgres returns them |
| Content type | `application/json` |

"Today" is computed in Singapore time, never from the server's UTC clock.

## 4. Slot vocabulary

Ten one-hour slots, 10:00 through 19:00 — the last one running 7pm–8pm, so the
grid matches the **10am–8pm, Mon–Sat** the knowledge base tells customers. A
**slot id is the literal value written to `jobs.visit_time`**, and it is the
only value the API accepts.

| Slot id | Say to the customer | | Slot id | Say to the customer |
|---|---|---|---|---|
| `10:00` | 10am–11am | | `15:00` | 3pm–4pm |
| `11:00` | 11am–12pm | | `16:00` | 4pm–5pm |
| `12:00` | 12pm–1pm | | `17:00` | 5pm–6pm |
| `13:00` | 1pm–2pm | | `18:00` | 6pm–7pm |
| `14:00` | 2pm–3pm | | `19:00` | 7pm–8pm |

| Rule | Value | Where it comes from |
|---|---|---|
| Working days | Mon–Sat | No site visit in the table's history falls on a Sunday |
| Capacity per slot | 2 | The most site visits ever booked into one hour is 2 |
| Capacity per day | 8 appointments of any kind | The busiest day this team has worked: 77 worked days in 90, mean 4.1, p90 7, six days at 8 |
| Minimum lead time | 3 hours | The business reschedules on 2–3 hours' notice, so a 9am lead can be seen before lunch |
| Availability horizon | 14 days ahead | |

Why hourly windows and not exact times: `jobs.visit_time` is `text` with no
duration column anywhere, so interval maths is not possible against this
schema. Windows make counting a floor-to-the-hour, so every appointment a human
booked by hand — the table holds `11:00` (38 of them), `14:30`, `15:15`,
`19:30` — consumes the right slot.

**Occupancy counts more than site visits, and more than this app's own jobs:**

- All three appointment types — site visit, job, second visit. An engineer on an
  installation is not free for a survey, so an installation at 13:30 eats into
  the 1pm–2pm survey slot.
- **Entries made directly in Google Calendar** — see §5.
- Work outside the offered grid (the legacy 09:00 / 09:30 / 00:00 rows, and
  untimed jobs) counts against the **day**, though it belongs to no slot.

Lost, cancelled and closed jobs count for nothing, and neither does a slot whose
calendar event someone deleted by hand — in this business, deleting the event is
how you say a visit isn't happening.

These numbers live in one place, `lib/availability.ts`, and are passed into the
booking RPC on every call, so the "is it free" answer and the "you may have it"
answer cannot drift apart. They're pinned by a unit test — changing one fails
the build before it reaches you.

## 5. Google Calendar is part of the answer

This team schedules a lot of work by typing it straight into Google Calendar:
over a 135-day window, **39 events on the calendar had no job row behind them** —
"Reserve 3 men first trip piping for 90180569", "Jackie save for urgent", "Book
Randy. Sys 2 second hand." Availability therefore reads the calendar too and
subtracts what it finds:

- an entry with a time consumes that hour, exactly like an appointment does;
- an entry without one (an all-day event) consumes one unit of the **day**;
- events this app created are excluded by event id, so nothing is counted twice;
- cancelled events are ignored;
- recurring series are expanded, so a weekly block is seen on every date.

**To close a whole day**, put a bracketed tag in the event's title:
`[Leave]`, `[Closed]`, `[Off]`, `[PH]`, `[Holiday]` or `[Blocked]` — e.g.
`[Leave] Jason`. It works on all-day and timed events, and a multi-day all-day
event closes every day it covers.

An all-day event is deliberately **not** treated as a closure on its own. Every
all-day event this calendar has ever held is a job with no fixed time —
"Servicing anytime before 8pm", "Check wire", "Silicon all holes" — and closing
those days would have shut five workable days in three months. A bracketed tag
also can't collide with the addresses that fill these titles, where "Block 231
Yishun Ring Road" is routine.

Planned closures are better set in the `booking_blackout_dates` table (§13),
which needs no calendar entry at all.

**If Google can't be read, the API fails open**: availability is computed from
jobs alone, bookings keep working, and the response carries
`"calendar_degraded": true`. Work that exists only in Calendar is invisible for
the duration, so an alert goes to the office through the same webhook as the
sync-failure digest. The assistant needs no special handling — it may simply
book as normal.

## 6. Endpoints

### `GET /api/booking/availability?from=YYYY-MM-DD&to=YYYY-MM-DD`

Both parameters optional. The default is the whole offerable window (lead-time
boundary → horizon). A range reaching past the horizon is **clamped, not
rejected**.

**200**

```json
{
  "timezone": "Asia/Singapore",
  "date_format": "YYYY-MM-DD",
  "time_format": "HH:MM (24h)",
  "slots": [
    { "slot": "10:00", "label": "10am–11am", "window": "10:00-11:00", "capacity": 2 },
    { "slot": "11:00", "label": "11am–12pm", "window": "11:00-12:00", "capacity": 2 }
  ],
  "working_days": "Mon-Sat",
  "daily_capacity": 8,
  "lead_time_hours": 3,
  "horizon_days": 14,
  "from": "2026-08-19",
  "to": "2026-09-02",
  "now": "2026-08-19T14:32",
  "calendar_degraded": false,
  "calendar_stale": false,
  "days": [
    {
      "date": "2026-08-19",
      "weekday": 3,
      "working_day": true,
      "day_remaining": 5,
      "slots": [
        { "slot": "10:00", "label": "10am–11am", "available": false, "remaining": 0, "reason": "past_lead_time" },
        { "slot": "17:00", "label": "5pm–6pm", "available": false, "remaining": 0, "reason": "calendar_block" },
        { "slot": "18:00", "label": "6pm–7pm", "available": true, "remaining": 1 },
        { "slot": "19:00", "label": "7pm–8pm", "available": true, "remaining": 2 }
      ]
    },
    {
      "date": "2026-08-24",
      "weekday": 1,
      "working_day": true,
      "day_remaining": 0,
      "calendar_block_reason": "[Leave] Jason",
      "slots": [
        { "slot": "10:00", "label": "10am–11am", "available": false, "remaining": 0, "reason": "calendar_block" }
      ]
    }
  ],
  "bookable": [
    { "date": "2026-08-19", "slot": "18:00", "label": "6pm–7pm" },
    { "date": "2026-08-19", "slot": "19:00", "label": "7pm–8pm" }
  ]
}
```

`bookable` is the same answer flattened, and is usually all the assistant needs.
`days` is there so a refusal can be explained:

- `reason` — `non_working_day`, `blackout`, `calendar_block`, `past_lead_time`,
  `beyond_horizon`, `slot_full`, `day_full`.
- `remaining` — bookings this slot will still accept. Always `0` when
  `available` is false.
- `day_remaining` — bookings the **day** will still accept whatever the slots
  say. When it's `0`, every slot reads `day_full`.
- `blackout_reason` / `calendar_block_reason` — set on a day closed by the
  blackout table or by a tagged calendar entry.

### `POST /api/booking/site-visit`

```json
{
  "idempotency_key": "b4f1e3a2-91d7-4c0a-8f2b-9d7a1c3e5b60",
  "visit_date": "2026-08-21",
  "visit_time": "13:00",
  "service_type": "new_installation",
  "unit_count": 3,
  "ac_brand": "Mitsubishi",
  "source": "WhatsApp",
  "indicative_quote": 2400,
  "chat_summary": "Wants 3 units, System 3. Prefers weekday afternoons.",
  "internal_notes": "Customer mentioned a low ceiling in the master bedroom.",
  "visit_phone": "+6591234567",
  "customer": {
    "name": "Tan Wei Ming",
    "phone": "+65 9123 4567",
    "address": "Blk 123 Ang Mo Kio Ave 6, #08-123, Singapore 560123",
    "unit_type": "hdb"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `idempotency_key` | yes | One UUID per booking attempt, reused on retries. 8–200 chars. |
| `visit_date` | yes | `YYYY-MM-DD`. Impossible dates (`2026-02-31`) are rejected, not rolled over. |
| `visit_time` | yes | A slot id — on the hour, 10:00–19:00. `14:30` is a validation error. |
| `service_type` | yes | `new_installation` \| `replacement` \| `servicing` \| `repair` |
| `unit_count` | no | Whole number, 1–20. |
| `ac_brand` | no | Free text, ≤80 chars. |
| `source` | no | `WhatsApp` (default) or `Website`. |
| `indicative_quote` | no | SGD number. Goes into `internal_notes` as text — see §9. |
| `chat_summary` | no | Free text, folded into `internal_notes`. |
| `internal_notes` | no | Free text. The composed note is capped at 4000 chars. |
| `visit_phone` | no | Defaults to the customer's number. |
| `customer.name` | yes | ≤120 chars. |
| `customer.phone` | yes | Any SG spelling; see §8. |
| `customer.address` | yes | The engineer has to be told where to go. |
| `customer.unit_type` | no | `hdb` \| `bto` \| `condo` \| `landed` |

`quoted_amount` and `stage` are **rejected with 422**, not ignored — see §9.

**201 Created** (and **200** for a replayed idempotency key)

```json
{
  "booking": {
    "job_id": "f2c1d0b9-6a3e-4d51-9c77-1b2e3a4d5c6f",
    "stage": "Site Visit Scheduled",
    "status": "open",
    "visit_date": "2026-08-21",
    "visit_time": "13:00",
    "slot_label": "1pm–2pm",
    "timezone": "Asia/Singapore",
    "service_type": "Installation",
    "unit_count": 3,
    "ac_brand": "Mitsubishi",
    "source": "WhatsApp",
    "visit_phone": "91234567",
    "internal_notes": "Indicative quote (pre-survey, not a quotation): SGD 2400.00\n\nWants 3 units, System 3. Prefers weekday afternoons.\n\nCustomer mentioned a low ceiling in the master bedroom.",
    "idempotency_key": "b4f1e3a2-91d7-4c0a-8f2b-9d7a1c3e5b60",
    "created_at": "2026-08-19T06:32:11.482913+00:00",
    "customer": {
      "id": "9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d",
      "name": "Tan Wei Ming",
      "phone": "91234567",
      "address": "Blk 123 Ang Mo Kio Ave 6, #08-123, Singapore 560123",
      "unit_type": "Resale"
    }
  },
  "idempotent_replay": false,
  "calendar_sync": "queued"
}
```

`calendar_sync: "queued"` means a `sync_queue` row exists and the calendar write
runs immediately after the response is sent. It typically lands within a couple
of seconds; if Google is down it retries with backoff, and the failure surfaces
on the job page, the Sync Health page and the daily digest email. **The
assistant should not wait for it or report on it** — the booking is confirmed
the moment it gets a 2xx.

### `POST /api/booking/reschedule`

```json
{
  "job_id": "f2c1d0b9-6a3e-4d51-9c77-1b2e3a4d5c6f",
  "visit_date": "2026-08-24",
  "visit_time": "15:00",
  "reason": "Customer asked to move it"
}
```

**200**

```json
{
  "booking": { "...": "same shape as above, with the new slot" },
  "status": "rescheduled",
  "previous": { "visit_date": "2026-08-21", "visit_time": "13:00" },
  "calendar_sync": "queued"
}
```

Rescheduling to the slot the job is already on returns `"status": "unchanged"`
with `calendar_sync: "unchanged"` — a retry settles instead of failing, even if
that slot is by then inside the lead-time window. The calendar event is moved,
not recreated.

Everything else is checked exactly as for a new booking, under the same lock, so
a reschedule can also come back `409 slot_taken`.

### `POST /api/booking/cancel`

```json
{
  "job_id": "f2c1d0b9-6a3e-4d51-9c77-1b2e3a4d5c6f",
  "reason": "Customer bought elsewhere"
}
```

`reason` is optional and defaults to `Cancelled by customer`. It is stored in
`loss_reason`, which is what the analytics page counts lost jobs by, so keep it
short and human.

**200**

```json
{
  "booking": { "...": "the job, with visit_date and visit_time now null" },
  "status": "cancelled",
  "calendar_sync": "queued"
}
```

What cancelling does:

- sets `status`, `loss_reason` and `closed_at`, which is how the rest of the app
  recognises a job nobody is working — it drops out of the attention lists and
  stops counting as open;
- clears `visit_date`/`visit_time`, which is the only thing the sync processor
  reads as "take this off the calendar";
- writes the slot that was cleared into `internal_notes`, so the office can
  still see what was cancelled;
- frees the slot immediately — the next availability call offers it again.

The job row is kept. Deleting it would erase the enquiry, the chat summary and
the reason it fell through. Cancelling an already-cancelled job returns `200`
with `"status": "already_cancelled"`.

## 7. Errors

Every error has the same shape: a stable machine-readable `error` code, a human
`message`, and sometimes extra fields.

| Situation | Status | `error` | Extra |
|---|---|---|---|
| Missing or wrong bearer token | 401 | `unauthorized` | |
| `BOOKING_API_SECRET` unset on the deployment | 503 | `not_configured` | |
| Body isn't JSON | 400 | `invalid_json` | |
| Validation failure | 422 | `validation_failed` | `details: [{ field, message }]` — **every** problem, not just the first |
| The slot can't be had | 409 | `slot_taken` | `reason`, and `slot_count`/`day_count` when it was a capacity race |
| Reschedule of a cancelled/closed job | 409 | `job_closed` | |
| Unknown `job_id` | 404 | `job_not_found` | |
| Anything unexpected | 500 | `server_error` | |

**`slot_taken` is the one to handle specially.** It covers every "you can't have
this slot" outcome, with the specific cause in `reason`:

```json
{
  "error": "slot_taken",
  "message": "That slot was taken while the customer was deciding. Fetch availability again and offer another.",
  "reason": "slot_full",
  "slot_count": 2,
  "day_count": 5
}
```

`reason` is one of `slot_full`, `day_full`, `calendar_block`, `non_working_day`,
`blackout`, `past_lead_time`, `beyond_horizon` — the same vocabulary the
availability response uses. They are one HTTP status on purpose: the assistant's
response to all of them is identical — apologise, re-fetch availability, offer
something else — and splitting them across statuses would only multiply the
branches in the adapter. `422` stays for "your request was malformed".

Note that the slot is re-checked against **all** the rules at write time, not
just capacity: a Sunday, a public holiday, a slot 20 minutes away or an hour
blocked in Google Calendar all come back as `409 slot_taken` with the reason,
even if the assistant's cached availability said otherwise.

A `422` looks like:

```json
{
  "error": "validation_failed",
  "message": "One or more fields are invalid.",
  "details": [
    { "field": "visit_time", "message": "Required. One of: 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 16:00, 17:00, 18:00, 19:00." },
    { "field": "customer.address", "message": "Required — the engineer has to be told where to go." }
  ]
}
```

`500` responses are safe to retry with the same idempotency key: either the
booking landed, in which case the retry returns it, or it didn't.

## 8. Field mapping and accepted values

| Assistant sends | Stored as | Accepted values |
|---|---|---|
| `customer.unit_type` | `customers.unit_type` | `hdb` → `Resale`, `bto` → `BTO`, `condo` → `Condo`, `landed` → `Landed` |
| `service_type` | `jobs.service_type` | `new_installation` → `Installation`, `replacement` → `Installation`, `servicing` → `Servicing`, `repair` → `Repair` |
| `source` | `jobs.source` | `WhatsApp`, `Website` |
| `ac_brand` | `jobs.ac_brand` | **Free text**, ≤80 chars — no constraint in the database, and the existing data is a mess (`Starmex`, `starmex `, `Mitusbishi`). Send the brand the customer agreed, spelled properly. |
| `unit_count` | `jobs.unit_count` | Integer 1–20 |
| chosen slot | `jobs.visit_date` + `jobs.visit_time` | See §4 |
| the WhatsApp number | `jobs.visit_phone` | |
| quote + summary | `jobs.internal_notes` | |
| — | `jobs.stage` | Always `Site Visit Scheduled` |

**`hdb` → `Resale` is deliberate.** The assistant's four choices have no word for
a resale flat, and an HDB flat that isn't a BTO is one; BTO is asked separately,
so nothing is lost. `Commercial` exists in the app but has no assistant
equivalent — commercial work arrives by phone and is entered by hand, so this
API never produces it.

The app's own spellings (`Condo`, `Installation`, …) are also accepted, so a
non-assistant caller isn't forced to speak the assistant's dialect.

**Phone numbers.** `91234567`, `9123 4567`, `9123-4567`, `6591234567`,
`+6591234567` and `+65 9123 4567` all identify the same customer and match the
same existing `customers` row. Numbers are stored in the local 8-digit form the
office is used to reading. Non-SG numbers are kept in full E.164 and matched on
all their digits, so an overseas number can't collide with a local one. Anything
shorter than 8 digits is rejected rather than stored as junk.

**Repeat customers.** Every booking looks the phone up before inserting, so a
returning customer reuses their existing row instead of gaining a duplicate one.
When the row already exists, a blank `address` or `unit_type` on it is filled in
from the booking, but nothing already there is overwritten: what the office
typed outranks what a chatbot was told.

## 9. `quoted_amount` is refused

The site visit precedes the quotation. A pre-survey figure in `quoted_amount`
would age, chase and report as if it were a real quotation — it drives quotation
ageing in `lib/attention.ts` and the financial reporting on the analytics page.

Send `indicative_quote` instead. It is recorded in `internal_notes`, prefixed
`Indicative quote (pre-survey, not a quotation):`, for an admin to turn into a
real quotation after the survey. Sending `quoted_amount` is a `422` rather than
a silent drop, so a mistake in the adapter is visible immediately.

`stage` is likewise refused: bookings are always created at
`Site Visit Scheduled` (`New Enquiry` is no longer an allowed stage).

## 10. Idempotency

- Send a fresh UUID as `idempotency_key` per booking **attempt**, and reuse it
  on every retry of that attempt.
- The key is stored on the job (`jobs.booking_idempotency_key`) behind a unique
  index, so a repeat cannot create a second job or a second calendar event.
- A repeat returns **`200`** with the original booking and
  `"idempotent_replay": true` — no second activity record, no second sync.
- A replay is answered **before** any availability check, so a retry is never
  told `slot_taken` for the slot it already holds — including when the visit is
  by then inside the 3-hour lead-time window.
- **Retention: for the life of the job row.** Keys are not expired or swept. If
  a job is deleted in the dashboard its key becomes reusable, which is the
  behaviour you want — the booking it referred to no longer exists.
- Reschedule and cancel don't need a key: both are naturally idempotent
  (`unchanged` / `already_cancelled`).

## 11. Concurrency

Two chats can be offered the same slot in the same second, and the assistant
reads availability seconds before it writes. So the capacity check is **not**
done at read time:

`book_site_visit` takes a Postgres transaction-scoped advisory lock keyed on
`(visit_date, visit_time)`, re-counts occupancy inside that lock, and only then
inserts. With a slot capacity of 2, three simultaneous bookings produce two
`201`s and one `409 slot_taken`. Verified by `scripts/booking-api-smoke.mjs`,
which fires capacity+1 simultaneous bookings at one slot and asserts the
database holds no more jobs than the slot's capacity afterwards.

## 12. Rate limits and timeouts

- **No rate limiting is enforced.** Please keep it under ~5 requests/second;
  availability is a database read plus a cached Google read, and the write path
  serialises per slot anyway.
- The Google Calendar read is cached for **5 minutes** per date window, so
  asking for availability repeatedly inside one conversation is cheap.
- Route timeout: **30 seconds** (`maxDuration`).
- Retry policy: retry `500`s and network timeouts with the **same** idempotency
  key. Never retry a `409` or a `422` — re-offer, or fix the payload.
- The Google Calendar write happens after the response, so it never counts
  against your request time.

## 13. Database access

**The assistant is on a different Supabase project from this app**, so there is
no SQL shortcut: availability must be read over HTTP through
`GET /api/booking/availability`. Do not point a Postgres client at this app's
database.

(For the record, this app is project `hypkgwxiefojoxhigskd`, region
`ap-south-1`. The `aws-0` / `aws-1` in a pooler hostname is only a shard, not a
project — the project ref in the connection string is what identifies it.)

### Blackout dates

Public holidays go in `booking_blackout_dates` (`date`, `reason`). The table
ships empty on purpose — the Mon–Sat pattern is in code, and inventing a
holiday calendar nobody confirmed would be worse than an empty table. Any date
in it is closed for booking and the reason comes back in the availability
response.

```sql
insert into public.booking_blackout_dates (date, reason)
values ('2027-01-01', 'New Year''s Day');
```

---

## Deploying this (for the app side)

1. **Apply the migration** `supabase/migrations/20260819000000_booking_api.sql`
   in the Supabase SQL editor. It adds the idempotency column and its unique
   index, the `booking_blackout_dates` and `booking_alert_state` tables, and the
   `book_site_visit` / `reschedule_site_visit` / `site_visit_slot_usage`
   functions. It is additive — nothing existing is altered.
2. **Create the bot identity**: `node scripts/create-booking-bot.mjs`. Creates
   the `AI Assistant` auth user and profile that bookings are attributed to
   (`jobs.created_by`), so `job_activity` says who booked what and an admin can
   filter bot-created jobs. Idempotent.
3. **Set `BOOKING_API_SECRET`** in Vercel (it is already in `.env.local`).
   Optionally set `BOOKING_BOT_USER_ID` to the id the script prints, which saves
   one lookup per cold start.
4. **Verify**: `node scripts/booking-api-smoke.mjs --base=<url> --purge`. It
   checks auth, validation, a real booking, idempotent replay, the
   repeat-customer lookup, a Sunday refusal, concurrent booking of one slot,
   that the job reached Google Calendar, reschedule, and cancel — then cleans up
   after itself.
5. **Unit tests**: `npm test` (no database, no network).

### Tuning capacity

Everything in §4 is a constant in `lib/availability.ts` — `SLOT_START_HOUR`,
`SLOT_END_HOUR`, `SLOT_CAPACITY`, `DAILY_APPOINTMENT_CAPACITY`, `MIN_LEAD_HOURS`,
`AVAILABILITY_HORIZON_DAYS`. They are passed to the booking RPC at call time
rather than duplicated in SQL, so changing one changes both the read and the
write path together. The unit test that pins them will fail, which is the point:
update it, and update §4 of this document.

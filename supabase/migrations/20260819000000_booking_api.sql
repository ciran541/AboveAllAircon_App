-- Booking API for the AI sales assistant.
--
-- The assistant qualifies a customer over WhatsApp and closes them onto a site
-- visit. It never holds Google credentials and never writes to Calendar: it
-- creates a job through /api/booking/site-visit, and the existing
-- enqueue_sync -> syncProcessor chain puts it on the calendar exactly as a
-- save from the dashboard does.
--
-- Two races this migration exists to close:
--
--   1. Double-booking. Two chats can be offered the same slot in the same
--      second. A read-then-write from the assistant cannot prevent it and
--      nothing in the schema did either — jobs has no uniqueness on
--      (visit_date, visit_time), nor should it, since a human may legitimately
--      overbook. book_site_visit() therefore takes a transaction-scoped
--      advisory lock keyed on the slot, re-counts capacity inside that lock,
--      and only then inserts.
--
--   2. Retries. A network timeout on the assistant's side turns one booking
--      into two jobs and two calendar events. Every booking carries an
--      idempotency key, unique across the table; a repeat of a key returns the
--      original job instead of creating a second one.
--
-- Capacity numbers and slot windows are NOT duplicated here. They are passed
-- in from lib/availability.ts on every call, so the read path (availability)
-- and the write path (this RPC) can never disagree about what "full" means.

-- ── Idempotency ───────────────────────────────────────────────────────────────

alter table public.jobs
  add column if not exists booking_idempotency_key text;

comment on column public.jobs.booking_idempotency_key is
  'Idempotency key supplied by the AI assistant when it created this job. '
  'Null for jobs created in the dashboard. Retained for the life of the row.';

-- Partial, so the hundreds of existing jobs (and every future dashboard save)
-- are unaffected while retries of the same booking collide.
create unique index if not exists idx_jobs_booking_idempotency_key
  on public.jobs (booking_idempotency_key)
  where booking_idempotency_key is not null;

-- ── Blackout dates ────────────────────────────────────────────────────────────

-- Public holidays and any other day the team isn't taking site visits.
-- Starts empty: the weekly pattern (Mon-Sat) lives in lib/availability.ts, and
-- inventing a public-holiday calendar nobody confirmed would be worse than an
-- empty table an admin fills in.
create table if not exists public.booking_blackout_dates (
  date       date primary key,
  reason     text,
  created_at timestamptz not null default now()
);

alter table public.booking_blackout_dates enable row level security;

drop policy if exists "Admins manage blackout dates" on public.booking_blackout_dates;
create policy "Admins manage blackout dates"
  on public.booking_blackout_dates for all
  using (auth.uid() in (select id from public.profiles where role = 'admin'));

drop policy if exists "Authenticated users read blackout dates" on public.booking_blackout_dates;
create policy "Authenticated users read blackout dates"
  on public.booking_blackout_dates for select
  to authenticated
  using (true);

-- ── Availability alert state ──────────────────────────────────────────────────

-- Remembers the last "availability can't read Google Calendar" alert, so an
-- outage produces one email rather than one per request.
--
-- Availability subtracts manual Google Calendar entries (leave, reserved
-- mornings, jobs typed straight into Calendar) from the slots it offers. When
-- Google can't be read it falls back to jobs-only and keeps booking — an
-- outage that stops every booking is worse than a rare double-book — but that
-- state is invisible from outside, because the API carries on answering 200.
-- This row is what makes it visible. Same shape and reasoning as
-- sync_alert_state; separate row because the two throttle independently.

create table if not exists public.booking_alert_state (
  id           int primary key default 1 check (id = 1),
  -- Hash of the current failure kind. Unchanged means "already reported".
  fingerprint  text,
  last_sent_at timestamptz,
  updated_at   timestamptz not null default now()
);

insert into public.booking_alert_state (id) values (1) on conflict (id) do nothing;

alter table public.booking_alert_state enable row level security;

drop policy if exists "Admins have full access to booking_alert_state" on public.booking_alert_state;
create policy "Admins have full access to booking_alert_state"
  on public.booking_alert_state for all
  using (auth.uid() in (select id from public.profiles where role = 'admin'));

-- ── Normalisation helpers ─────────────────────────────────────────────────────

-- The date columns are not one type: visit_date and job_date are `date`,
-- second_visit_date is `text` and may hold '' or something half-typed. Casting
-- it directly is a runtime error waiting for the first malformed row.
create or replace function public.parse_slot_date(p_value text)
returns date
language sql
immutable
as $$
  select case
    when p_value ~ '^\d{4}-\d{2}-\d{2}' then left(p_value, 10)::date
    else null
  end;
$$;

-- Mirrors normalizeTime() in lib/availability.ts: '9:00', '09:00:00' and
-- ' 9:5 ' all become '09:00' / '09:05', so zero-padded string comparison
-- against a window boundary is exact. Anything else is treated as untimed.
create or replace function public.normalize_slot_time(p_value text)
returns text
language sql
immutable
as $$
  select case
    when btrim(coalesce(p_value, '')) ~ '^\d{1,2}:\d{1,2}' then
      lpad(split_part(btrim(p_value), ':', 1), 2, '0') || ':' ||
      lpad(left(split_part(btrim(p_value), ':', 2), 2), 2, '0')
    else null
  end;
$$;

-- ── Occupancy ─────────────────────────────────────────────────────────────────

-- How full one day is, in the two senses that matter: appointments inside the
-- requested slot window, and appointments of any kind that day.
--
-- Deliberately counts all three appointment types, not just site visits — an
-- engineer on an installation is not free for a survey. Deliberately ignores
-- jobs that are lost or closed, and slots whose Calendar event a person
-- deleted by hand (calendar_slot_removals, and only for the date the removal
-- was recorded against — the same rule removalApplies() uses in
-- lib/syncProcessor.ts). This is the SQL twin of capacityAppointments() +
-- occupancyByDate() in lib/availability.ts.
create or replace function public.site_visit_slot_usage(
  p_date           date,
  p_window_start   text,
  p_window_end     text,
  p_exclude_job_id uuid default null
)
returns table (slot_count integer, day_count integer)
language sql
stable
security definer
set search_path = public
as $$
  with live_jobs as (
    select j.*
      from public.jobs j
     where coalesce(j.status, 'open') = 'open'
       and nullif(btrim(coalesce(j.loss_reason, '')), '') is null
       and j.closed_at is null
       and (p_exclude_job_id is null or j.id <> p_exclude_job_id)
  ),
  appts as (
    select id as job_id,
           'site_visit'::text as event_type,
           public.parse_slot_date(visit_date::text) as slot_date,
           public.normalize_slot_time(visit_time) as slot_time
      from live_jobs
     where visit_date is not null
    union all
    select id,
           'job',
           public.parse_slot_date(job_date::text),
           public.normalize_slot_time(job_time)
      from live_jobs
     where job_date is not null
    union all
    select id,
           'second_visit',
           public.parse_slot_date(second_visit_date::text),
           public.normalize_slot_time(second_visit_time)
      from live_jobs
     where second_visit_date is not null
  ),
  live as (
    select a.*
      from appts a
      left join public.calendar_slot_removals r
        on  r.job_id     = a.job_id
        and r.event_type = a.event_type
        and r.slot_date  = a.slot_date
     where a.slot_date = p_date
       and r.id is null
  )
  select
    count(*) filter (
      where slot_time is not null
        and slot_time >= p_window_start
        and slot_time <  p_window_end
    )::integer as slot_count,
    count(*)::integer as day_count
  from live;
$$;

-- ── Booking ───────────────────────────────────────────────────────────────────

-- Creates a site-visit job for the assistant, atomically.
--
-- p_customer: {"id"?, "name", "phone", "phone_match", "address", "unit_type"}
--   phone_match is the trailing-digit key from lib/phone.ts — '91234567' for
--   every spelling of the same Singapore number, so a repeat customer matches
--   their existing row instead of gaining a duplicate one.
-- p_job: {"service_type", "ac_brand", "unit_count", "visit_phone", "source",
--         "stage", "internal_notes"}
--
-- Returns one of:
--   {"status":"created",    "job_id":..., "customer_id":..., "customer_created":bool}
--   {"status":"duplicate",  "job_id":..., "customer_id":...}   -- key seen before
--   {"status":"slot_taken", "slot_count":n, "day_count":m}
--
-- slot_taken is returned rather than raised so the route can answer 409 with a
-- machine-readable body: the assistant needs to apologise and re-offer, which
-- is a different conversation from a generic failure.
create or replace function public.book_site_visit(
  p_idempotency_key text,
  p_visit_date      date,
  p_visit_time      text,
  p_window_start    text,
  p_window_end      text,
  p_slot_capacity   integer,
  p_day_capacity    integer,
  p_customer        jsonb,
  p_job             jsonb,
  p_created_by      uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing         public.jobs%rowtype;
  v_customer_id      uuid;
  v_customer_created boolean := false;
  v_match            text;
  v_slot_count       integer;
  v_day_count        integer;
  v_job_id           uuid;
begin
  -- One writer per (date, slot) at a time. Transaction-scoped, so it is
  -- released the moment this function's implicit transaction ends, whichever
  -- way it ends.
  perform pg_advisory_xact_lock(
    hashtextextended(p_visit_date::text || 'T' || coalesce(p_visit_time, ''), 0)
  );

  -- Idempotency first: a retry must never be told the slot it already holds
  -- has been taken.
  select * into v_existing
    from public.jobs
   where booking_idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'status', 'duplicate',
      'job_id', v_existing.id,
      'customer_id', v_existing.customer_id
    );
  end if;

  select slot_count, day_count
    into v_slot_count, v_day_count
    from public.site_visit_slot_usage(p_visit_date, p_window_start, p_window_end);

  if v_slot_count >= p_slot_capacity or v_day_count >= p_day_capacity then
    return jsonb_build_object(
      'status', 'slot_taken',
      'slot_count', v_slot_count,
      'day_count', v_day_count
    );
  end if;

  -- Customer: match on phone before inserting, or every repeat customer
  -- becomes a new row (saveJob's newCustomerData path always INSERTs).
  v_customer_id := nullif(p_customer->>'id', '')::uuid;
  v_match := coalesce(p_customer->>'phone_match', '');

  if v_customer_id is null and length(v_match) >= 8 then
    select id into v_customer_id
      from public.customers
     where length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) >= length(v_match)
       and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), length(v_match)) = v_match
     order by created_at nulls last, id
     limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (name, phone, address, unit_type)
    values (
      nullif(btrim(coalesce(p_customer->>'name', '')), ''),
      nullif(btrim(coalesce(p_customer->>'phone', '')), ''),
      nullif(btrim(coalesce(p_customer->>'address', '')), ''),
      nullif(btrim(coalesce(p_customer->>'unit_type', '')), '')
    )
    returning id into v_customer_id;
    v_customer_created := true;
  else
    -- Fill blanks, never overwrite. What the office typed is the record of
    -- truth; what a chatbot was told is a best effort.
    update public.customers
       set address    = coalesce(nullif(btrim(coalesce(address, '')), ''),
                                 nullif(btrim(coalesce(p_customer->>'address', '')), '')),
           unit_type  = coalesce(unit_type,
                                 nullif(btrim(coalesce(p_customer->>'unit_type', '')), '')),
           updated_at = now()
     where id = v_customer_id;
  end if;

  insert into public.jobs (
    created_by, customer_id, stage, status,
    service_type, ac_brand, unit_count,
    visit_date, visit_time, visit_phone,
    source, internal_notes, booking_idempotency_key
  )
  values (
    p_created_by,
    v_customer_id,
    coalesce(nullif(p_job->>'stage', ''), 'Site Visit Scheduled'),
    'open',
    nullif(p_job->>'service_type', ''),
    nullif(p_job->>'ac_brand', ''),
    nullif(p_job->>'unit_count', '')::integer,
    p_visit_date,
    p_visit_time,
    nullif(p_job->>'visit_phone', ''),
    nullif(p_job->>'source', ''),
    nullif(p_job->>'internal_notes', ''),
    p_idempotency_key
  )
  returning id into v_job_id;

  return jsonb_build_object(
    'status', 'created',
    'job_id', v_job_id,
    'customer_id', v_customer_id,
    'customer_created', v_customer_created
  );

exception
  -- Belt and braces: two retries of one key that somehow slip past the lookup
  -- above still collapse to the original job rather than erroring at the
  -- assistant.
  when unique_violation then
    select * into v_existing
      from public.jobs
     where booking_idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'status', 'duplicate',
        'job_id', v_existing.id,
        'customer_id', v_existing.customer_id
      );
    end if;
    raise;
end;
$$;

-- Moves an existing site visit, under the same lock and the same capacity
-- rules as a fresh booking — a reschedule can double-book a slot just as
-- easily as a booking can.
--
-- Returns:
--   {"status":"rescheduled","job_id":...,"previous_date":...,"previous_time":...}
--   {"status":"unchanged","job_id":...}      -- already on that slot; a retry
--   {"status":"not_found"}
--   {"status":"closed"}                      -- lost, closed or cancelled
--   {"status":"slot_taken","slot_count":n,"day_count":m}
create or replace function public.reschedule_site_visit(
  p_job_id        uuid,
  p_visit_date    date,
  p_visit_time    text,
  p_window_start  text,
  p_window_end    text,
  p_slot_capacity integer,
  p_day_capacity  integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job        public.jobs%rowtype;
  v_slot_count integer;
  v_day_count  integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_visit_date::text || 'T' || coalesce(p_visit_time, ''), 0)
  );

  select * into v_job from public.jobs where id = p_job_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if coalesce(v_job.status, 'open') <> 'open'
     or nullif(btrim(coalesce(v_job.loss_reason, '')), '') is not null
     or v_job.closed_at is not null then
    return jsonb_build_object('status', 'closed');
  end if;

  if v_job.visit_date = p_visit_date
     and coalesce(public.normalize_slot_time(v_job.visit_time), '')
         = coalesce(public.normalize_slot_time(p_visit_time), '') then
    return jsonb_build_object('status', 'unchanged', 'job_id', v_job.id);
  end if;

  -- The job's own current slot must not count against it.
  select slot_count, day_count
    into v_slot_count, v_day_count
    from public.site_visit_slot_usage(p_visit_date, p_window_start, p_window_end, p_job_id);

  if v_slot_count >= p_slot_capacity or v_day_count >= p_day_capacity then
    return jsonb_build_object(
      'status', 'slot_taken',
      'slot_count', v_slot_count,
      'day_count', v_day_count
    );
  end if;

  update public.jobs
     set visit_date = p_visit_date,
         visit_time = p_visit_time,
         updated_at = now()
   where id = p_job_id;

  return jsonb_build_object(
    'status', 'rescheduled',
    'job_id', p_job_id,
    'previous_date', v_job.visit_date,
    'previous_time', v_job.visit_time
  );
end;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────

-- Postgres grants EXECUTE on new functions to PUBLIC by default, and PostgREST
-- exposes them — without these revokes anyone holding the anon key could book
-- jobs straight into the calendar. Only the service role, which is what the
-- route handlers use behind the BOOKING_API_SECRET check, may call them.
revoke execute on function public.book_site_visit(text, date, text, text, text, integer, integer, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.reschedule_site_visit(uuid, date, text, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.site_visit_slot_usage(date, text, text, uuid) from public, anon;

grant execute on function public.book_site_visit(text, date, text, text, text, integer, integer, jsonb, jsonb, uuid) to service_role;
grant execute on function public.reschedule_site_visit(uuid, date, text, text, text, integer, integer) to service_role;
grant execute on function public.site_visit_slot_usage(date, text, text, uuid) to service_role, authenticated;

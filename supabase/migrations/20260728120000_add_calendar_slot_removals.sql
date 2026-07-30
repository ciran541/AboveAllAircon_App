-- Records calendar slots whose Google event was deleted by a person, directly
-- in Calendar, rather than through this app.
--
-- Before this table, reconciliation treated a deleted event as corruption and
-- recreated it. That is wrong for the common case: deleting the event *is* how
-- someone says "this isn't happening". Recreating it produces a zombie event
-- that reappears every time it's deleted — the same class of bug as overwriting
-- a manual reschedule, which reconcileCalendar already refuses to do.
--
-- A deletion is therefore taken at face value: the slot is recorded here, its
-- dead event id is cleared off the job, and it stays off the calendar for good.
-- Nothing asks about it and nothing alerts on it — the deletion was the
-- decision. The job page shows the slot as off the calendar and offers a
-- deliberate "put it back" for the rare mistake, which creates a *fresh* event
-- (Google returns a stripped tombstone for a deleted event and refuses to
-- revive it, answering 403 — which is what made the old loop endless).
--
-- resolution 'kept_off' → the only steady state: recorded, accepted, stays off
-- resolution null       → transitional only; rows predating self-resolving
--                         removals, settled on the next reconciliation pass

create table public.calendar_slot_removals (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  event_type  text not null check (event_type in ('site_visit', 'job', 'second_visit')),
  -- The dead event id, kept for the audit trail once the job's column is cleared.
  event_id    text,
  -- The slot's date when the removal was detected. If the job is later
  -- rescheduled in the app, that is a fresh intent to be on the calendar, so a
  -- removal recorded against the old date no longer applies and is discarded.
  slot_date   date,
  detected_at timestamptz not null default now(),
  resolution  text check (resolution in ('kept_off')),
  resolved_at timestamptz,
  -- One live record per slot; a re-removal after restoring replaces it.
  unique (job_id, event_type)
);

-- Vestigial: kept because this migration has already run in production and the
-- index is free to maintain (its predicate matches almost nothing now that
-- removals resolve themselves). Do not build anything on "pending" removals.
create index idx_calendar_slot_removals_pending
  on public.calendar_slot_removals(detected_at desc)
  where resolution is null;

alter table public.calendar_slot_removals enable row level security;

create policy "Admins have full access to calendar_slot_removals"
  on public.calendar_slot_removals for all
  using (auth.uid() in (select id from public.profiles where role = 'admin'));

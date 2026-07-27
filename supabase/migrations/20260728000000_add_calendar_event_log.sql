-- Audit trail of every Calendar mutation this app makes (or attempts),
-- independent of sync_queue (which only tracks *current* retry state, not
-- history). Exists so a future "why did this event disappear" question can
-- be answered definitively ("our app never touched it between X and Y")
-- instead of inferred after the fact from Calendar's own timestamps.

create table public.calendar_event_log (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid references public.jobs(id) on delete set null,
  event_type text,
  operation  text not null check (operation in ('create', 'update', 'delete', 'drift_detected')),
  event_id   text,
  success    boolean not null,
  error      text,
  created_at timestamptz not null default now()
);

create index idx_calendar_event_log_job_id on public.calendar_event_log(job_id, created_at desc);
create index idx_calendar_event_log_created_at on public.calendar_event_log(created_at desc);

alter table public.calendar_event_log enable row level security;

create policy "Admins have full access to calendar_event_log"
  on public.calendar_event_log for all
  using (auth.uid() in (select id from public.profiles where role = 'admin'));

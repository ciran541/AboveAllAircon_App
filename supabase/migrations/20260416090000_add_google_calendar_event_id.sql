alter table public.jobs
add column if not exists google_calendar_event_id text;

create index if not exists idx_jobs_google_calendar_event_id
on public.jobs(google_calendar_event_id);
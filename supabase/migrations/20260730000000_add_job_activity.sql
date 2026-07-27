-- Field-level history of what people actually changed on a job.
--
-- calendar_event_log answers "what did we tell Google", which turned out not
-- to be the useful question -- it reads as "update | OK" and can't tell you
-- that a visit moved from 11 Jul to 14 Jul, or who moved it. This table
-- answers "what did a human change, from what, to what", and the Job Detail
-- timeline renders the two together so a change and its calendar outcome read
-- as one story.
--
-- Kept separate from calendar_event_log deliberately: merging them would mean
-- overloading that table's operation constraint and having both queries filter
-- each other out, for no saving at ~30 rows/day.

create table public.job_activity (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs(id) on delete cascade,
  actor_id   uuid,
  action     text not null check (action in ('created', 'updated', 'deleted')),
  -- [{ field, from, to }, ...] as produced by lib/jobDiff.ts
  changes    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_job_activity_job on public.job_activity(job_id, created_at desc);
create index idx_job_activity_created_at on public.job_activity(created_at desc);

alter table public.job_activity enable row level security;

create policy "Admins have full access to job_activity"
  on public.job_activity for all
  using (auth.uid() in (select id from public.profiles where role = 'admin'));

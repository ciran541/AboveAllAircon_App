-- Superseded before ever being applied to prod by a generic, reusable sync
-- queue covering Calendar, Sheets backup, and Meta-lead sync (previously
-- Sheets/Meta failures were silent fire-and-forget calls with no tracking
-- at all — this replaces both that and the calendar-only columns below
-- with one mechanism). Defensive drop covers the case where an earlier
-- version of this file was already run manually via the Supabase SQL Editor.
alter table public.jobs
  drop column if exists calendar_sync_error,
  drop column if exists calendar_synced_at;

create table public.sync_queue (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.jobs(id) on delete cascade,
  integration     text not null check (integration in ('calendar', 'sheets', 'meta_lead')),
  status          text not null default 'pending' check (status in ('pending', 'processing', 'success', 'failed')),
  attempts        int  not null default 0,
  max_attempts    int  not null default 5,
  next_attempt_at timestamptz not null default now(),
  claimed_at      timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One row per (job, integration): this table tracks current sync state,
-- not an append-only log.
create unique index ux_sync_queue_job_integration on public.sync_queue(job_id, integration);
create index idx_sync_queue_claimable on public.sync_queue(status, next_attempt_at);
create index idx_sync_queue_job_id on public.sync_queue(job_id);

alter table public.sync_queue enable row level security;

create policy "Admins have full access to sync_queue"
  on public.sync_queue for all
  using (auth.uid() in (select id from public.profiles where role = 'admin'));

-- Atomic claim: SKIP LOCKED means two overlapping after()/cron invocations
-- can never grab the same row, so no duplicate Calendar events under a race.
create or replace function public.claim_sync_queue_batch(p_limit int, p_stale_after interval, p_job_id uuid default null)
returns setof public.sync_queue
language sql
as $$
  update public.sync_queue
  set status = 'processing', claimed_at = now(), attempts = attempts + 1, updated_at = now()
  where id in (
    select id from public.sync_queue
    where (p_job_id is null or job_id = p_job_id)
      and (
        (status = 'pending' and next_attempt_at <= now())
        or (status = 'processing' and claimed_at < now() - p_stale_after)
      )
    order by created_at
    limit p_limit
    for update skip locked
  )
  returning *;
$$;

-- Enqueue: insert, or reset an existing failed/success row back to pending.
-- Leaves an in-flight ('processing') row alone rather than racing its write.
--
-- SECURITY DEFINER: sync_queue itself is locked to admins (policy above), but
-- any staff member who can save a job (see "Users update own jobs" on public.jobs)
-- needs to be able to enqueue sync for it. This function is the one narrow,
-- safe operation exposed to all authenticated users regardless of that RLS —
-- it only ever inserts/resets a (job_id, integration) row, nothing more.
create or replace function public.enqueue_sync(p_job_id uuid, p_integration text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.sync_queue (job_id, integration)
  values (p_job_id, p_integration)
  on conflict (job_id, integration) do update
    set status = 'pending', attempts = 0, last_error = null, next_attempt_at = now(), updated_at = now()
    where public.sync_queue.status in ('failed', 'success');
$$;

grant execute on function public.enqueue_sync(uuid, text) to authenticated;

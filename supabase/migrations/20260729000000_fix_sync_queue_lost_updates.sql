-- Closes a lost-update race in the sync queue.
--
-- Before: enqueue_sync no-oped whenever the row was already 'processing'
-- (its DO UPDATE carried `where status in ('failed','success')`). So:
--   save A enqueues -> claimed, in-flight run reads visit_date = Jul 11
--   save B changes it to Jul 14 -> enqueue is a NO-OP (row is 'processing')
--   save B's after() calls claim_sync_queue_batch -> row isn't 'pending', skipped
--   the in-flight run finishes and marks the row 'success'
-- Result: Jul 14 never reached Google Calendar and nothing recorded a problem.
--
-- After: enqueue_sync always bumps enqueued_at, even mid-flight. Completion
-- then only accepts a 'success' when the data it synced was enqueued no later
-- than the moment it was claimed; otherwise the row goes straight back to
-- pending so the newer data gets synced too.

alter table public.sync_queue
  add column if not exists enqueued_at timestamptz not null default now();

-- Enqueue: always record that fresh work arrived (enqueued_at), regardless of
-- current status. Only reset the retry state when a run isn't already in
-- flight -- stomping attempts/status mid-run would race the in-flight worker.
create or replace function public.enqueue_sync(p_job_id uuid, p_integration text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.sync_queue (job_id, integration)
  values (p_job_id, p_integration)
  on conflict (job_id, integration) do update
    set enqueued_at     = now(),
        updated_at      = now(),
        status          = case when public.sync_queue.status = 'processing'
                               then public.sync_queue.status else 'pending' end,
        attempts        = case when public.sync_queue.status = 'processing'
                               then public.sync_queue.attempts else 0 end,
        last_error      = case when public.sync_queue.status = 'processing'
                               then public.sync_queue.last_error else null end,
        next_attempt_at = case when public.sync_queue.status = 'processing'
                               then public.sync_queue.next_attempt_at else now() end;
$$;

-- Completion: single atomic write of a run's outcome.
--   p_error null  -> success, UNLESS newer work was enqueued while this run was
--                    in flight (enqueued_at > claimed_at), in which case the row
--                    returns to pending and due now so the newer data syncs.
--   p_error set   -> failed once attempts are exhausted, otherwise pending with
--                    backoff. last_error is always recorded either way, so the
--                    UI can surface a problem immediately instead of waiting for
--                    attempts to run out.
create or replace function public.complete_sync_row(
  p_id               uuid,
  p_error            text    default null,
  p_backoff_minutes  int     default 5,
  p_out_of_attempts  boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    public.sync_queue%rowtype;
  v_status text;
begin
  select * into v_row from public.sync_queue where id = p_id for update;
  if not found then
    return null;
  end if;

  if p_error is null then
    if v_row.claimed_at is not null and v_row.enqueued_at > v_row.claimed_at then
      v_status := 'pending';   -- newer data landed mid-flight; run again
    else
      v_status := 'success';
    end if;
  elsif p_out_of_attempts then
    v_status := 'failed';
  else
    v_status := 'pending';
  end if;

  update public.sync_queue
  set status          = v_status,
      last_error      = p_error,
      updated_at      = now(),
      next_attempt_at = case
        when v_status <> 'pending' then next_attempt_at
        when p_error is null       then now()   -- re-run immediately for newer data
        else now() + make_interval(mins => p_backoff_minutes)
      end
  where id = p_id;

  return v_status;
end;
$$;

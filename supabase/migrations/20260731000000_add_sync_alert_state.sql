-- Remembers what the last alert email was about, so the daily cron can stay
-- quiet when nothing has changed.
--
-- Without this, an unresolved problem would generate an identical email every
-- single day until someone fixed it, which trains people to ignore the alerts
-- entirely -- the opposite of the point.
--
-- Single row by construction (id is pinned to 1).

create table public.sync_alert_state (
  id           int primary key default 1 check (id = 1),
  -- Hash of the sorted set of currently-unresolved problems. A change here
  -- means something genuinely new is wrong, which is worth an email.
  fingerprint  text,
  last_sent_at timestamptz,
  updated_at   timestamptz not null default now()
);

insert into public.sync_alert_state (id) values (1) on conflict (id) do nothing;

alter table public.sync_alert_state enable row level security;

create policy "Admins have full access to sync_alert_state"
  on public.sync_alert_state for all
  using (auth.uid() in (select id from public.profiles where role = 'admin'));

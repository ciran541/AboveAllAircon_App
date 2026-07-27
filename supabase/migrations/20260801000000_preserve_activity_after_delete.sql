-- Make job history survive the deletion of its job.
--
-- job_activity.job_id was declared `references jobs(id) on delete cascade`,
-- which means deleting a job also erased its entire history -- including the
-- record of the deletion itself. Deleting a job is the most destructive action
-- in the app (it removes the record and its calendar events), so it is exactly
-- the thing that must leave a trace.
--
-- The foreign key is dropped rather than relaxed: job_id stays a plain
-- (indexed) uuid so history outlives the row it describes. job_label carries a
-- human-readable snapshot so a deleted job is still identifiable once its
-- customer join is gone.

alter table public.job_activity
  drop constraint if exists job_activity_job_id_fkey;

alter table public.job_activity
  add column if not exists job_label text;

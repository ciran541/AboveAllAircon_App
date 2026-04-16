-- Add the missing job_event_id column to the jobs table.
-- visit_event_id and second_visit_event_id already exist.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS job_event_id text;

CREATE INDEX IF NOT EXISTS idx_jobs_job_event_id ON public.jobs(job_event_id);

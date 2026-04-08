-- Add job_time field to jobs table
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS job_time text;
